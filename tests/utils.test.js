const test = require("node:test");
const assert = require("node:assert");
const jwt = require("jsonwebtoken");
const { jwtSecret } = require("../src/config");
const {
  now,
  makeSlug,
  normalizeText,
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  recipeCard,
} = require("../src/utils");

test("ModuĹ‚ Utils - Testy Jednostkowe", async (t) => {

  await t.test("now() - powinno zwracaÄ‡ obiekt Date", () => {
    const date = now();
    assert.ok(date instanceof Date);
  });

  await t.test("makeSlug() - powinno tworzyc slug z tekstu i polskich znakow", () => {
    assert.strictEqual(makeSlug("\u015aniadanie i Obiad!"), "sniadanie-i-obiad");
    assert.strictEqual(makeSlug("Zupa pomidorowa z kluskami lane..."), "zupa-pomidorowa-z-kluskami-lane");
    assert.strictEqual(makeSlug("M\u0105ka pszenna"), "maka-pszenna");
    assert.strictEqual(makeSlug("   Spacja na Pocz\u0105tku i Ko\u0144cu   "), "spacja-na-poczatku-i-koncu");
  });

  await t.test("normalizeText() - powinno normalizowac tekst do wyszukiwania", () => {
    assert.strictEqual(normalizeText("Za\u017c\u00f3\u0142\u0107 g\u0119\u015bl\u0105 ja\u017a\u0144"), "zazo\u0142c gesla jazn");
    assert.strictEqual(normalizeText("\u0141\u00d3D\u0179 \u015aled\u017a 123!"), "\u0142odz sledz 123!");
    assert.strictEqual(normalizeText("  Du\u017co  Spacji  "), "duzo  spacji");
  });

  await t.test("hashPassword() i verifyPassword() - powinno poprawnie haszowaÄ‡ i weryfikowaÄ‡ hasĹ‚a", async () => {
    const password = "SuperSecretPassword123!";
    const hash = await hashPassword(password);

    assert.ok(hash);
    assert.notStrictEqual(hash, password);

    // Weryfikacja poprawnego hasĹ‚a
    const isValid = await verifyPassword(password, hash);
    assert.strictEqual(isValid, true);

    // Weryfikacja bĹ‚Ä™dnego hasĹ‚a
    const isInvalid = await verifyPassword("WrongPassword", hash);
    assert.strictEqual(isInvalid, false);
  });

  await t.test("signToken() - powinno generowaÄ‡ poprawny token JWT z danymi uĹĽytkownika", () => {
    const dummyUser = {
      _id: { toString: () => "665000000000000000000001" },
      username: "testuser",
      role: "admin",
    };

    const token = signToken(dummyUser);
    assert.ok(token);

    const payload = jwt.verify(token, jwtSecret);
    assert.strictEqual(payload.sub, "665000000000000000000001");
    assert.strictEqual(payload.username, "testuser");
    assert.strictEqual(payload.role, "admin");
  });

  await t.test("publicUser() - powinno mapowaÄ‡ obiekt uĹĽytkownika na postaÄ‡ publicznÄ… ukrywajÄ…c hasĹ‚o", () => {
    const fullUser = {
      _id: { toString: () => "665000000000000000000002" },
      username: "kucharz12",
      email: "kucharz@example.com",
      passwordHash: "$2a$12$SomeFakeBcryptHashForTesting...",
      role: "user",
      profile: {
        displayName: "Pan Kucharz",
        bio: "GotujÄ™ z pasjÄ…",
        avatarUrl: "https://example.com/avatar.jpg",
      },
      createdAt: new Date("2026-01-01T12:00:00.000Z"),
      updatedAt: new Date("2026-01-01T12:00:00.000Z"),
    };

    const mapped = publicUser(fullUser);

    assert.ok(mapped);
    assert.strictEqual(mapped.id, "665000000000000000000002");
    assert.strictEqual(mapped.username, "kucharz12");
    assert.strictEqual(mapped.email, "kucharz@example.com");
    assert.strictEqual(mapped.role, "user");
    assert.strictEqual(mapped.profile.displayName, "Pan Kucharz");
    assert.strictEqual(mapped.profile.bio, "GotujÄ™ z pasjÄ…");
    assert.strictEqual(mapped.profile.avatarUrl, "https://example.com/avatar.jpg");
    assert.strictEqual(mapped.createdAt.toISOString(), "2026-01-01T12:00:00.000Z");

    // Kluczowe zabezpieczenie: pole passwordHash NIE powinno byÄ‡ obecne!
    assert.strictEqual(mapped.passwordHash, undefined);
  });

  await t.test("recipeCard() - powinno poprawnie formatowaÄ‡ dane przepisu do widoku karty przepisu", () => {
    const fullRecipe = {
      _id: { toString: () => "665000000000000000000003" },
      slug: "pyszna-szarlotka",
      title: "Pyszna Szarlotka",
      description: "Przepis na klasycznÄ… domowÄ… szarlotkÄ™ z cynamonem.",
      categorySlug: "desery",
      tags: ["ciasto", "jablka", "cynamon"],
      diets: ["wegetarianskie"],
      difficulty: "medium",
      ratingAvg: 4.8,
      ratingCount: 12,
      commentCount: 5,
      favoriteCount: 20,
      totalTimeMinutes: 60,
      servings: 8,
      images: [
        { url: "https://example.com/szarlotka1.jpg", alt: "Szarlotka z gĂłry", isMain: false },
        { url: "https://example.com/szarlotka_main.jpg", alt: "GĹ‚Ăłwne zdjÄ™cie", isMain: true },
      ],
      authorSnapshot: {
        username: "cukiernik",
        displayName: "Mistrz WypiekĂłw",
      },
      createdAt: new Date("2026-02-15T14:30:00.000Z"),
    };

    const card = recipeCard(fullRecipe);

    assert.ok(card);
    assert.strictEqual(card.id, "665000000000000000000003");
    assert.strictEqual(card.slug, "pyszna-szarlotka");
    assert.strictEqual(card.title, "Pyszna Szarlotka");
    assert.strictEqual(card.description, "Przepis na klasycznÄ… domowÄ… szarlotkÄ™ z cynamonem.");
    assert.strictEqual(card.categorySlug, "desery");
    assert.deepStrictEqual(card.tags, ["ciasto", "jablka", "cynamon"]);
    assert.deepStrictEqual(card.diets, ["wegetarianskie"]);
    assert.strictEqual(card.difficulty, "medium");
    assert.strictEqual(card.ratingAvg, 4.8);
    assert.strictEqual(card.ratingCount, 12);
    assert.strictEqual(card.commentCount, 5);
    assert.strictEqual(card.favoriteCount, 20);
    assert.strictEqual(card.totalTimeMinutes, 60);
    assert.strictEqual(card.servings, 8);

    // Powinno wybraÄ‡ gĹ‚Ăłwne zdjÄ™cie (isMain: true)
    assert.strictEqual(card.image, "https://example.com/szarlotka_main.jpg");

    assert.deepStrictEqual(card.author, {
      username: "cukiernik",
      displayName: "Mistrz WypiekĂłw",
    });
    assert.strictEqual(card.createdAt.toISOString(), "2026-02-15T14:30:00.000Z");
  });

});
