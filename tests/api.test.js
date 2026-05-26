// Wymuszenie uĹĽycia bazy testowej przed zaĹ‚adowaniem jakichkolwiek moduĹ‚Ăłw aplikacji!
process.env.MONGODB_DB_NAME = "recipes_app_test";

const test = require("node:test");
const assert = require("node:assert");
const { connectDb } = require("../src/db");
const { createApp } = require("../src/server");
const { hashPassword } = require("../src/utils");

test("ModuĹ‚ API - Testy Integracyjne", async (t) => {
  let db;
  let server;
  let baseUrl;

  // Przechowywanie tokenĂłw i danych testowych
  let adminToken = "";
  let userToken = "";
  let otherUserToken = "";

  let adminId = "";
  let userId = "";
  let otherUserId = "";

  let categoryId = "";
  let categorySlug = "obiady";

  let recipeId = "";
  let recipeSlug = "";

  let commentId = "";

  let shoppingListId = "";
  let mealPlanId = "";

  // Pomocnicza funkcja do wykonywania zapytaĹ„ HTTP
  async function request(path, options = {}) {
    const url = `${baseUrl}${path}`;
    const headers = {
      "Content-Type": "application/json",
      ...options.headers,
    };
    const response = await fetch(url, {
      ...options,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const status = response.status;
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : null;
    return { status, data };
  }

  // Hook przed caĹ‚Ä… seriÄ… testĂłw - uruchomienie serwera i czyszczenie bazy
  t.before(async () => {
    // 1. PodĹ‚Ä…czenie do bazy z obsĹ‚ugÄ… bĹ‚Ä™du duplikatu indeksu
    try {
      db = await connectDb();
    } catch (err) {
      if (err.code === 11000 || err.message.includes("Index build failed") || err.message.includes("duplicate key")) {
        const { MongoClient } = require("mongodb");
        const { mongoUri } = require("../src/config");
        const tempClient = new MongoClient(mongoUri);
        await tempClient.connect();
        const tempDb = tempClient.db("recipes_app_test");
        await tempDb.dropDatabase();
        await tempClient.close();

        db = await connectDb();
      } else {
        throw err;
      }
    }

    // 2. CaĹ‚kowite czyszczenie bazy testowej przed testami
    await db.dropDatabase();

    // Ponowna inicjalizacja indeksĂłw
    const { getDb, ensureIndexes } = require("../src/db");
    const testDb = getDb();
    await ensureIndexes(testDb);

    // 3. Dodanie poczÄ…tkowych kont uĹĽytkownikĂłw bezpoĹ›rednio do DB
    const adminPasswordHash = await hashPassword("AdminPass123!");
    const userPasswordHash = await hashPassword("UserPass123!");
    const otherUserPasswordHash = await hashPassword("OtherPass123!");

    const adminUser = {
      username: "admin_test",
      email: "admin_test@example.com",
      passwordHash: adminPasswordHash,
      role: "admin",
      profile: { displayName: "Test Admin" },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const standardUser = {
      username: "user_test",
      email: "user_test@example.com",
      passwordHash: userPasswordHash,
      role: "user",
      profile: { displayName: "Test User" },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const otherUser = {
      username: "other_test",
      email: "other_test@example.com",
      passwordHash: otherUserPasswordHash,
      role: "user",
      profile: { displayName: "Other User" },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const adminResult = await testDb.collection("users").insertOne(adminUser);
    const userResult = await testDb.collection("users").insertOne(standardUser);
    const otherResult = await testDb.collection("users").insertOne(otherUser);

    adminId = adminResult.insertedId.toString();
    userId = userResult.insertedId.toString();
    otherUserId = otherResult.insertedId.toString();

    // 4. Uruchomienie aplikacji Express na porcie tymczasowym (0)
    const app = createApp();
    server = app.listen(0);
    const port = server.address().port;
    baseUrl = `http://localhost:${port}/api`;
  });

  // Hook po caĹ‚ej serii testĂłw - zamkniÄ™cie serwera i odĹ‚Ä…czenie DB
  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  // ==========================================
  // 1. TESTY ZDROWIA SERWERA
  // ==========================================
  await t.test("GET /health - powinno zwrĂłciÄ‡ status OK", async () => {
    const { status, data } = await request("/health");
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.service, "recipes-nosql");
  });

  // ==========================================
  // 2. TESTY AUTORYZACJI (REGISTER & LOGIN)
  // ==========================================
  await t.test("POST /auth/register - walidacja bĹ‚Ä™dnych danych wejĹ›ciowych Zod", async () => {
    const badPayload = {
      username: "ab", // Za krĂłtki (min 3)
      email: "not-an-email", // ZĹ‚y format e-mail
      password: "123", // Za krĂłtkie (min 8)
    };
    const { status, data } = await request("/auth/register", {
      method: "POST",
      body: badPayload,
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, "VALIDATION_ERROR");
  });

  await t.test("POST /auth/register - pomyĹ›lna rejestracja nowego uĹĽytkownika", async () => {
    const payload = {
      username: "nowy_kucharz",
      email: "nowy@example.com",
      password: "PospoliteHaslo12!",
      displayName: "Nowy Kucharz",
    };
    const { status, data } = await request("/auth/register", {
      method: "POST",
      body: payload,
    });
    assert.strictEqual(status, 201);
    assert.ok(data.token);
    assert.strictEqual(data.user.username, "nowy_kucharz");
    assert.strictEqual(data.user.email, "nowy@example.com");
    assert.strictEqual(data.user.role, "user");
  });

  await t.test("POST /auth/register - prĂłba rejestracji duplikatu loginu/e-maila", async () => {
    const payload = {
      username: "user_test", // Duplikat loginu z seeda before
      email: "nowy@example.com", // Duplikat emaila
      password: "PospoliteHaslo12!",
    };
    const { status, data } = await request("/auth/register", {
      method: "POST",
      body: payload,
    });
    assert.strictEqual(status, 409);
    assert.strictEqual(data.error.code, "DUPLICATE_USER");
  });

  await t.test("POST /auth/login - logowanie z bĹ‚Ä™dnymi danymi", async () => {
    const payload = {
      email: "user_test@example.com",
      password: "WrongPassword123",
    };
    const { status, data } = await request("/auth/login", {
      method: "POST",
      body: payload,
    });
    assert.strictEqual(status, 401);
    assert.strictEqual(data.error.code, "INVALID_CREDENTIALS");
  });

  await t.test("POST /auth/login - pomyĹ›lne logowanie uĹĽytkownikĂłw (User, Admin, Other)", async () => {
    // 1. ZwykĹ‚y uĹĽytkownik
    const userRes = await request("/auth/login", {
      method: "POST",
      body: { email: "user_test@example.com", password: "UserPass123!" }
    });
    assert.strictEqual(userRes.status, 200);
    userToken = userRes.data.token;
    assert.ok(userToken);

    // 2. Administrator
    const adminRes = await request("/auth/login", {
      method: "POST",
      body: { email: "admin_test@example.com", password: "AdminPass123!" }
    });
    assert.strictEqual(adminRes.status, 200);
    adminToken = adminRes.data.token;
    assert.ok(adminToken);

    // 3. Drugi standardowy uĹĽytkownik (do testĂłw uprawnieĹ„ edycji)
    const otherRes = await request("/auth/login", {
      method: "POST",
      body: { email: "other_test@example.com", password: "OtherPass123!" }
    });
    assert.strictEqual(otherRes.status, 200);
    otherUserToken = otherRes.data.token;
    assert.ok(otherUserToken);
  });

  await t.test("GET /users/me - pobieranie profilu zalogowanego uĹĽytkownika", async () => {
    const { status, data } = await request("/users/me", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.user.username, "user_test");
    assert.strictEqual(data.user.email, "user_test@example.com");
  });

  // ==========================================
  // 3. TESTY KATEGORII (ADMIN ONLY CRUD)
  // ==========================================
  await t.test("POST /categories - brak autoryzacji / rola uĹĽytkownika powinna dostaÄ‡ 403", async () => {
    const payload = { name: "Obiady", description: "Dania gĹ‚Ăłwne" };
    // Bez tokenu -> 401
    const resNoAuth = await request("/categories", { method: "POST", body: payload });
    assert.strictEqual(resNoAuth.status, 401);

    // Z tokenem uĹĽytkownika -> 403 Forbidden
    const resUserAuth = await request("/categories", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: payload
    });
    assert.strictEqual(resUserAuth.status, 403);
    assert.strictEqual(resUserAuth.data.error.code, "FORBIDDEN");
  });

  await t.test("POST /categories - admin poprawnie tworzy kategoriÄ™", async () => {
    const payload = { name: "Obiady", description: "Dania gĹ‚Ăłwne", order: 1 };
    const { status, data } = await request("/categories", {
      method: "POST",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: payload
    });
    assert.strictEqual(status, 201);
    assert.ok(data.item._id);
    assert.strictEqual(data.item.name, "Obiady");
    assert.strictEqual(data.item.slug, "obiady");
    categoryId = data.item._id;
  });

  await t.test("GET /categories - pobranie listy kategorii bez autoryzacji", async () => {
    const { status, data } = await request("/categories");
    assert.strictEqual(status, 200);
    assert.ok(Array.isArray(data.items));
    assert.ok(data.items.length >= 1);
    assert.strictEqual(data.items[0].slug, "obiady");
  });

  // ==========================================
  // 4. TESTY PRZEPISĂ“W (CRUD & VALIDATION)
  // ==========================================
  await t.test("POST /recipes - walidacja schema przepisu", async () => {
    const badPayload = {
      title: "Zupa", // Za krĂłtki tytuĹ‚
      description: "Zupa lekka.", // Za krĂłtki opis
      categoryId,
      ingredients: [], // Brak skĹ‚adnikĂłw (wymagane min 1)
      steps: [], // Brak krokĂłw
      prepTimeMinutes: 10,
      cookTimeMinutes: -5, // Czas nie moĹĽe byÄ‡ ujemny
      servings: 0, // Porcje muszÄ… byÄ‡ min 1
    };
    const { status, data } = await request("/recipes", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: badPayload
    });
    assert.strictEqual(status, 400);
    assert.strictEqual(data.error.code, "VALIDATION_ERROR");
  });

  await t.test("POST /recipes - dodawanie przepisu przez uĹĽytkownika", async () => {
    const payload = {
      title: "Klasyczny Kotlet Schabowy",
      description: "Tradycyjny polski kotlet schabowy w chrupiÄ…cej panierce z ziemniakami.",
      categoryId,
      ingredients: [
        { name: "schab wieprzowy", quantity: 500, unit: "g", note: "pokrojony w plastry" },
        { name: "jaja", quantity: 2, unit: "szt" },
        { name: "buĹ‚ka tarta", quantity: 100, unit: "g" },
      ],
      steps: [
        { order: 1, instruction: "Plastry schabu rozbiÄ‡ tĹ‚uczkiem, doprawiÄ‡ solÄ… i pieprzem.", durationMinutes: 5 },
        { order: 2, instruction: "Kotlety panierowaÄ‡ w mÄ…ce, roztrzepanym jajku i buĹ‚ce tartej.", durationMinutes: 5 },
        { order: 3, instruction: "SmaĹĽyÄ‡ na smalcu lub oleju na zĹ‚oty kolor z obu stron.", durationMinutes: 10 },
      ],
      tags: ["obiad", "schabowy", "polskie-smaki"],
      diets: ["high-protein"],
      prepTimeMinutes: 15,
      cookTimeMinutes: 15,
      servings: 4,
      difficulty: "medium",
      status: "published",
    };

    const { status, data } = await request("/recipes", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: payload
    });

    assert.strictEqual(status, 201);
    assert.ok(data.item.id);
    assert.strictEqual(data.recipe.title, "Klasyczny Kotlet Schabowy");
    assert.strictEqual(data.recipe.slug, "klasyczny-kotlet-schabowy");
    assert.strictEqual(data.recipe.totalTimeMinutes, 30); // 15 + 15
    assert.strictEqual(data.recipe.categorySlug, "obiady");
    assert.strictEqual(data.recipe.authorSnapshot.username, "user_test");

    // Sprawdzenie normalizacji skĹ‚adnikĂłw
    assert.strictEqual(data.recipe.ingredients[0].normalizedName, "schab-wieprzowy");

    recipeId = data.item.id;
    recipeSlug = data.recipe.slug;
  });

  await t.test("GET /recipes/:slug - pobranie szczegĂłĹ‚Ăłw pojedynczego przepisu", async () => {
    const { status, data } = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(status, 200);
    assert.strictEqual(data.recipe.title, "Klasyczny Kotlet Schabowy");
    assert.strictEqual(data.recipe.description, "Tradycyjny polski kotlet schabowy w chrupiÄ…cej panierce z ziemniakami.");
    assert.ok(Array.isArray(data.comments));
    assert.strictEqual(data.comments.length, 0); // Jeszcze brak komentarzy
  });

  await t.test("PATCH /recipes/:id - prĂłba edycji przepisu przez innego uĹĽytkownika (403)", async () => {
    const { status } = await request(`/recipes/${recipeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${otherUserToken}` },
      body: { title: "Kotlet Schabowy Zmieniony Przez Hakera" }
    });
    assert.strictEqual(status, 403);
  });

  await t.test("PATCH /recipes/:id - pomyĹ›lna edycja przez wĹ‚aĹ›ciciela przepisu", async () => {
    const { status, data } = await request(`/recipes/${recipeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${userToken}` },
      body: { title: "Kotlet Schabowy Tradycyjny" }
    });
    assert.strictEqual(status, 200);
    assert.strictEqual(data.ok, true);

    // Sprawdzenie, czy slug zmieniĹ‚ siÄ™ pod nowy tytuĹ‚
    const checkRes = await request(`/recipes/kotlet-schabowy-tradycyjny`);
    assert.strictEqual(checkRes.status, 200);
    assert.strictEqual(checkRes.data.recipe.title, "Kotlet Schabowy Tradycyjny");

    // Aktualizujemy lokalny slug
    recipeSlug = checkRes.data.recipe.slug;
  });

  // ==========================================
  // 5. TESTY ZAAWANSOWANEGO WYSZUKIWANIA I FILTROWANIA
  // ==========================================
  await t.test("GET /recipes - wyszukiwanie i filtry przepisĂłw", async () => {
    // Dodajmy szybko drugi przepis jako "draft", aby sprawdziÄ‡, czy nie pojawia siÄ™ w publicznej wyszukiwarce
    await request("/recipes", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: {
        title: "Szybka jajecznica na maĹ›le",
        description: "Jajecznica z 3 jajek ze szczypiorkiem smaĹĽona powoli.",
        categoryId,
        ingredients: [{ name: "jaja", quantity: 3, unit: "szt" }],
        steps: [{ order: 1, instruction: "SmaĹĽyÄ‡ jajka na maĹ‚ym ogniu.", durationMinutes: 5 }],
        status: "draft", // Szkic
        prepTimeMinutes: 5,
        cookTimeMinutes: 5,
        servings: 1
      }
    });

    // 1. Wszystkie publiczne przepisy
    const resAll = await request("/recipes");
    assert.strictEqual(resAll.status, 200);
    assert.strictEqual(resAll.data.items.length, 1); // Tylko schabowy (draft jest ukryty)
    assert.strictEqual(resAll.data.items[0].title, "Kotlet Schabowy Tradycyjny");

    // 2. Filtrowanie po kategorii
    const resCat = await request(`/recipes?category=obiady`);
    assert.strictEqual(resCat.data.items.length, 1);
    const resCatEmpty = await request(`/recipes?category=desery`);
    assert.strictEqual(resCatEmpty.data.items.length, 0);

    // 3. Filtrowanie po maksymalnym czasie
    const resTime = await request(`/recipes?maxTime=40`);
    assert.strictEqual(resTime.data.items.length, 1);
    const resTimeEmpty = await request(`/recipes?maxTime=20`);
    assert.strictEqual(resTimeEmpty.data.items.length, 0);

    // 4. Filtrowanie po tagach
    const resTags = await request(`/recipes?tags=obiad`);
    assert.strictEqual(resTags.data.items.length, 1);
    const resTagsEmpty = await request(`/recipes?tags=wege`);
    assert.strictEqual(resTagsEmpty.data.items.length, 0);

    // 5. Filtrowanie po skĹ‚adnikach
    const resIng = await request(`/recipes?ingredients=schab-wieprzowy`);
    assert.strictEqual(resIng.data.items.length, 1);
    const resIngEmpty = await request(`/recipes?ingredients=pomidor`);
    assert.strictEqual(resIngEmpty.data.items.length, 0);
  });

  // ==========================================
  // 6. TESTY OCENIANIA (RATINGS & RATINGAVG)
  // ==========================================
  await t.test("PUT & DELETE /recipes/:id/rating - dodawanie oceny i przeliczanie Ĺ›redniej", async () => {
    // 1. Pierwsza ocena (User 1 dodaje 5 gwiazdek)
    const rating1 = await request(`/recipes/${recipeId}/rating`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${userToken}` },
      body: { value: 5 }
    });
    assert.strictEqual(rating1.status, 200);

    // Weryfikacja przeliczenia
    let recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.ratingAvg, 5);
    assert.strictEqual(recipeCheck.data.recipe.ratingCount, 1);

    // 2. Druga ocena (Other User dodaje 3 gwiazdki)
    const rating2 = await request(`/recipes/${recipeId}/rating`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${otherUserToken}` },
      body: { value: 3 }
    });
    assert.strictEqual(rating2.status, 200);

    // Ĺšrednia powinna wynosiÄ‡ (5 + 3) / 2 = 4.0
    recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.ratingAvg, 4);
    assert.strictEqual(recipeCheck.data.recipe.ratingCount, 2);

    // Pobranie mojej oceny
    const myRating = await request(`/recipes/${recipeId}/rating/me`, {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    assert.strictEqual(myRating.status, 200);
    assert.strictEqual(myRating.data.rating.value, 3);

    // 3. UsuniÄ™cie oceny przez Other User
    const delRating = await request(`/recipes/${recipeId}/rating`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    assert.strictEqual(delRating.status, 200);

    // Ĺšrednia powinna wrĂłciÄ‡ do 5.0 (tylko ocena User 1 pozostaĹ‚a)
    recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.ratingAvg, 5);
    assert.strictEqual(recipeCheck.data.recipe.ratingCount, 1);
  });

  // ==========================================
  // 7. TESTY KOMENTARZY (CRUD & COUNTERS)
  // ==========================================
  await t.test("POST /recipes/:recipeId/comments - dodawanie komentarza i licznik komentarzy", async () => {
    const payload = { body: "To jest niesamowity przepis! RobiĹ‚em juĹĽ trzy razy." };
    const { status, data } = await request(`/recipes/${recipeId}/comments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${otherUserToken}` },
      body: payload
    });
    assert.strictEqual(status, 201);
    assert.ok(data.item._id);
    assert.strictEqual(data.item.body, payload.body);
    assert.strictEqual(data.item.userSnapshot.username, "other_test");
    commentId = data.item._id;

    // Sprawdzenie inkrementacji licznika komentarzy w przepisie
    const recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.commentCount, 1);

    // Sprawdzenie czy komentarz jest na liĹ›cie przepisu
    assert.strictEqual(recipeCheck.data.comments.length, 1);
    assert.strictEqual(recipeCheck.data.comments[0].body, payload.body);
  });

  await t.test("PATCH /comments/:id - edycja komentarza", async () => {
    const { status } = await request(`/comments/${commentId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${otherUserToken}` },
      body: { body: "Edytowany super przepis! Bardzo smaczne." }
    });
    assert.strictEqual(status, 200);

    // Pobranie komentarzy w celu sprawdzenia edycji
    const listRes = await request(`/recipes/${recipeId}/comments`);
    assert.strictEqual(listRes.status, 200);
    assert.strictEqual(listRes.data.items[0].body, "Edytowany super przepis! Bardzo smaczne.");
  });

  await t.test("PATCH /admin/comments/:id/status - moderacja komentarza i licznik", async () => {
    const hideRes = await request(`/admin/comments/${commentId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: "hidden" }
    });
    assert.strictEqual(hideRes.status, 200);

    let recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.commentCount, 0);
    assert.strictEqual(recipeCheck.data.comments.length, 0);

    const showRes = await request(`/admin/comments/${commentId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: "visible" }
    });
    assert.strictEqual(showRes.status, 200);

    recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.commentCount, 1);
    assert.strictEqual(recipeCheck.data.comments.length, 1);
  });

  await t.test("DELETE /comments/:id - usuwanie komentarza (soft delete w db/status)", async () => {
    // UsuniÄ™cie wĹ‚asnego komentarza przez Other User
    const { status } = await request(`/comments/${commentId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    assert.strictEqual(status, 200);

    // Sprawdzenie dekrementacji licznika komentarzy w przepisie
    const recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.commentCount, 0);
  });

  // ==========================================
  // 8. TESTY ULUBIONYCH (FAVORITES)
  // ==========================================
  await t.test("POST, GET & DELETE /me/favorites - obsĹ‚uga ulubionych przepisĂłw", async () => {
    // 1. Dodawanie do ulubionych
    const addRes = await request(`/me/favorites/${recipeId}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    assert.strictEqual(addRes.status, 201);

    // Ulubione w przepisie powinno wzrosnÄ…Ä‡
    let recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.favoriteCount, 1);

    // 2. Pobranie moich ulubionych
    const getRes = await request("/me/favorites", {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.data.items.length, 1);
    assert.strictEqual(getRes.data.items[0].recipeSnapshot.title, "Kotlet Schabowy Tradycyjny");

    // 3. UsuniÄ™cie z ulubionych
    const delRes = await request(`/me/favorites/${recipeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    assert.strictEqual(delRes.status, 200);

    // Licznik w przepisie powinien zmaleÄ‡ do 0
    recipeCheck = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(recipeCheck.data.recipe.favoriteCount, 0);
  });

  // ==========================================
  // 9. TESTY LIST ZAKUPĂ“W (SHOPPING LISTS & SCALING)
  // ==========================================
  await t.test("POST /me/shopping-lists - rÄ™czne tworzenie listy", async () => {
    const payload = {
      name: "Zakupy Tygodniowe",
      items: [
        { name: "Mleko", quantity: 2, unit: "l", checked: false },
        { name: "Chleb", quantity: 1, unit: "szt", checked: true },
      ],
    };
    const { status, data } = await request("/me/shopping-lists", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: payload
    });
    assert.strictEqual(status, 201);
    assert.strictEqual(data.item.name, "Zakupy Tygodniowe");
    assert.strictEqual(data.item.items.length, 2);
    shoppingListId = data.item._id;
  });

  await t.test("POST /recipes/:recipeId/shopping-list - generowanie i skalowanie skĹ‚adnikĂłw przepisu!", async () => {
    // Przepis ma porcje = 4. My generujemy na porcje = 8.
    // MnoĹĽnik wynosi 8 / 4 = 2x.
    // SkĹ‚adnik wejĹ›ciowy: schab wieprzowy = 500g. Po przeskalowaniu powinien wynosiÄ‡ 1000g.
    const { status, data } = await request(`/recipes/${recipeId}/shopping-list`, {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: { servings: 8 }
    });

    assert.strictEqual(status, 201);
    assert.strictEqual(data.item.servings, 8);
    assert.strictEqual(data.item.name, "Zakupy: Kotlet Schabowy Tradycyjny");

    // Sprawdzenie iloĹ›ci skĹ‚adnika schab wieprzowy po przeliczeniu: 500 * 2 = 1000
    const schab = data.item.items.find((i) => i.name === "schab wieprzowy");
    assert.ok(schab);
    assert.strictEqual(schab.quantity, 1000);
    assert.strictEqual(schab.unit, "g");
  });

  await t.test("PATCH & DELETE /me/shopping-lists/:id - edycja i usuwanie list zakupĂłw", async () => {
    // Edycja (odznaczenie mleka)
    const updateRes = await request(`/me/shopping-lists/${shoppingListId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${userToken}` },
      body: {
        name: "Zmieniona Nazwa",
        items: [{ name: "Mleko", quantity: 2, unit: "l", checked: true }],
      }
    });
    assert.strictEqual(updateRes.status, 200);

    // UsuniÄ™cie listy
    const deleteRes = await request(`/me/shopping-lists/${shoppingListId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(deleteRes.status, 200);
  });

  // ==========================================
  // 10. TESTY PLANU POSIĹKĂ“W (MEAL PLANS)
  // ==========================================
  await t.test("POST, GET, PATCH & DELETE /me/meal-plans - obsĹ‚uga planera posiĹ‚kĂłw", async () => {
    // 1. Dodanie posiĹ‚ku do planu
    const addRes = await request("/me/meal-plans", {
      method: "POST",
      headers: { Authorization: `Bearer ${userToken}` },
      body: {
        recipeId,
        plannedFor: "2026-05-28",
        mealType: "dinner",
        servings: 4,
      }
    });
    assert.strictEqual(addRes.status, 201);
    assert.strictEqual(addRes.data.item.mealType, "dinner");
    assert.strictEqual(addRes.data.item.plannedFor, "2026-05-28");
    assert.strictEqual(addRes.data.item.recipeSnapshot.title, "Kotlet Schabowy Tradycyjny");
    mealPlanId = addRes.data.item._id;

    // 2. Pobranie planu w zakresie dat
    const getRes = await request("/me/meal-plans?from=2026-05-25&to=2026-05-30", {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(getRes.status, 200);
    assert.strictEqual(getRes.data.items.length, 1);
    assert.strictEqual(getRes.data.items[0]._id, mealPlanId);

    // 3. Edycja wpisu (np. porcje)
    const patchRes = await request(`/me/meal-plans/${mealPlanId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${userToken}` },
      body: { servings: 6 }
    });
    assert.strictEqual(patchRes.status, 200);

    // 4. UsuniÄ™cie wpisu z planera
    const delRes = await request(`/me/meal-plans/${mealPlanId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${userToken}` },
    });
    assert.strictEqual(delRes.status, 200);
  });

  // ==========================================
  // 11. TESTY ZGĹOSZEĹ I MODERACJI ADMINA
  // ==========================================
  await t.test("POST /recipes/:id/reports i GET /admin/reports - obsĹ‚uga zgĹ‚oszeĹ„", async () => {
    // 1. ZgĹ‚oszenie przepisu przez zalogowanego uĹĽytkownika
    const reportRes = await request(`/recipes/${recipeId}/reports`, {
      method: "POST",
      headers: { Authorization: `Bearer ${otherUserToken}` },
      body: { reason: "Przepis zawiera nieprawdziwe proporcje skĹ‚adnikĂłw." }
    });
    assert.strictEqual(reportRes.status, 201);
    assert.strictEqual(reportRes.data.item.status, "new");

    // 2. Pobranie zgĹ‚oszeĹ„ przez administratora
    const getReports = await request("/admin/reports", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(getReports.status, 200);
    assert.ok(Array.isArray(getReports.data.items));
    assert.strictEqual(getReports.data.items[0].recipeId, recipeId);
    assert.strictEqual(getReports.data.items[0].reason, "Przepis zawiera nieprawdziwe proporcje skĹ‚adnikĂłw.");
  });

  await t.test("GET /admin/summary - pobieranie statystyk administracyjnych", async () => {
    const { status, data } = await request("/admin/summary", {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(status, 200);
    assert.ok(data.stats);
    // PowinniĹ›my mieÄ‡ 3 uĹĽytkownikĂłw w bazie testowej (admin, user, other + nowy_kucharz ze specyficznego testu = 4)
    assert.strictEqual(data.stats.users, 4);
    assert.strictEqual(data.stats.admins, 1);
    assert.strictEqual(data.stats.recipes, 2); // Schabowy + Jajecznica
  });

  await t.test("PATCH /admin/recipes/:id/status - ukrywanie/pokazywanie przepisu przez admina", async () => {
    // Ukrycie przepisu (zmiana na hidden)
    const hideRes = await request(`/admin/recipes/${recipeId}/status`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: "hidden" }
    });
    assert.strictEqual(hideRes.status, 200);

    // Sprawdzenie, czy jest teraz niedostÄ™pny dla publicznoĹ›ci
    const publicRes = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(publicRes.status, 404); // Przepis o statusie hidden zwraca 404 dla zwykĹ‚ych zapytaĹ„
  });

  await t.test("DELETE /admin/recipes/:id - admin usuwa przepis przez soft delete", async () => {
    const deleteRes = await request(`/admin/recipes/${recipeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.strictEqual(deleteRes.status, 200);

    const publicRes = await request(`/recipes/${recipeSlug}`);
    assert.strictEqual(publicRes.status, 404);
  });

  await t.test("PATCH /admin/users/:id - rola admina i blokowanie konta przez moderatora", async () => {
    // Blokujemy konto uĹĽytkownika "other_test"
    const blockRes = await request(`/admin/users/${otherUserId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { status: "blocked" }
    });
    assert.strictEqual(blockRes.status, 200);

    // Sprawdzenie, czy zablokowany uĹĽytkownik dostanie bĹ‚Ä…d przy prĂłbie logowania!
    const loginRes = await request("/auth/login", {
      method: "POST",
      body: { email: "other_test@example.com", password: "OtherPass123!" }
    });
    assert.strictEqual(loginRes.status, 403);
    assert.strictEqual(loginRes.data.error.code, "ACCOUNT_BLOCKED");

    // Sprawdzenie, czy zablokowany uĹĽytkownik dostanie bĹ‚Ä…d przy zapytaniach z zapisanym starym tokenem JWT!
    const queryMeRes = await request("/users/me", {
      headers: { Authorization: `Bearer ${otherUserToken}` },
    });
    // W middleware requireAuth jest sprawdzane req.user.status === "blocked" -> 403
    assert.strictEqual(queryMeRes.status, 403);
    assert.strictEqual(queryMeRes.data.error.code, "ACCOUNT_BLOCKED");
  });

});
