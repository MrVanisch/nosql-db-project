const express = require("express");
const { z } = require("zod");
const { getDb, oid } = require("./db");
const { asyncHandler, errorResponse, requireAuth, requireAdmin } = require("./middleware");
const {
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  recipeCard,
  makeSlug,
  normalizeText,
  now,
} = require("./utils");

const router = express.Router();

const registerSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(120),
  displayName: z.string().trim().max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

const ingredientSchema = z.object({
  name: z.string().trim().min(2).max(100),
  quantity: z.coerce.number().positive().max(100000),
  unit: z.string().trim().min(1).max(24),
  note: z.string().trim().max(120).optional().default(""),
});

const stepSchema = z.object({
  order: z.coerce.number().int().positive(),
  instruction: z.string().trim().min(6).max(1200),
  durationMinutes: z.coerce.number().int().min(0).max(600).optional().default(0),
});

const recipeSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().min(12).max(1200),
  categoryId: z.string().optional(),
  categorySlug: z.string().trim().min(2).max(80).optional(),
  ingredients: z.array(ingredientSchema).min(1),
  steps: z.array(stepSchema).min(1),
  tags: z.array(z.string().trim().min(2).max(40)).max(12).default([]),
  diets: z.array(z.string().trim().min(2).max(40)).max(8).default([]),
  images: z.array(z.object({
    url: z.string().trim().url(),
    alt: z.string().trim().max(160).optional().default(""),
    isMain: z.boolean().optional().default(false),
  })).max(6).default([]),
  nutrition: z.object({
    calories: z.coerce.number().int().min(0).max(5000).optional().default(0),
    protein: z.coerce.number().min(0).max(500).optional().default(0),
    fat: z.coerce.number().min(0).max(500).optional().default(0),
    carbs: z.coerce.number().min(0).max(800).optional().default(0),
  }).optional().default({}),
  prepTimeMinutes: z.coerce.number().int().min(0).max(1440),
  cookTimeMinutes: z.coerce.number().int().min(0).max(1440),
  servings: z.coerce.number().int().min(1).max(64),
  difficulty: z.enum(["easy", "medium", "hard"]).default("easy"),
  status: z.enum(["draft", "published"]).default("published"),
});

function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    }));
    const error = new Error("VALIDATION_ERROR");
    error.status = 400;
    error.details = details;
    throw error;
  }
  return result.data;
}

function cleanList(value) {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  return raw.map((item) => makeSlug(item)).filter(Boolean);
}

async function uniqueSlug(collection, title, currentId) {
  const base = makeSlug(title) || "przepis";
  let slug = base;
  let counter = 2;
  while (await collection.findOne({ slug, ...(currentId ? { _id: { $ne: currentId } } : {}) })) {
    slug = `${base}-${counter}`;
    counter += 1;
  }
  return slug;
}

async function recalculateRating(db, recipeId) {
  // === MONGODB AGGREGATION PIPELINE ===
  // Agregacja (Aggregation Framework) służy do zaawansowanego przetwarzania i analizowania danych.
  // Tutaj obliczamy statystyki ocen (średnią oraz ilość) na podstawie powiązanych dokumentów z kolekcji "ratings".
  const [stats] = await db.collection("ratings").aggregate([
    // 1. $match: Etap filtrowania – dopasowuje oceny tylko do konkretnego ID przepisu (zmniejsza zbiór dokumentów na wejściu)
    { $match: { recipeId } },
    // 2. $group: Etap grupowania – grupuje po ID przepisu, obliczając średnią ($avg) wartości oraz zliczając sumę dokumentów ($sum)
    { $group: { _id: "$recipeId", avg: { $avg: "$value" }, count: { $sum: 1 } } },
  ]).toArray();

  // === MONGODB UPDATE & operator $set ===
  // Aktualizuje dokument przepisu atomically. Używa operatora modyfikacji $set, aby zapisać wyliczoną średnią,
  // ilość ocen oraz nową sygnaturę czasową modyfikacji dokumentu.
  await db.collection("recipes").updateOne(
    { _id: recipeId },
    { $set: { ratingAvg: stats ? Math.round(stats.avg * 10) / 10 : 0, ratingCount: stats?.count || 0, updatedAt: now() } },
  );
}

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "recipes-nosql", time: new Date().toISOString() });
});

router.post("/auth/register", asyncHandler(async (req, res) => {
  const data = parse(registerSchema, req.body);
  const db = getDb();
  const user = {
    username: data.username,
    email: data.email,
    passwordHash: await hashPassword(data.password),
    role: "user",
    profile: {
      displayName: data.displayName || data.username,
      bio: "",
      avatarUrl: "",
    },
    createdAt: now(),
    updatedAt: now(),
  };

  try {
    const result = await db.collection("users").insertOne(user);
    user._id = result.insertedId;
  } catch (err) {
    if (err.code === 11000) {
      return errorResponse(res, 409, "DUPLICATE_USER", "E-mail albo nazwa uzytkownika jest juz zajeta");
    }
    throw err;
  }

  res.status(201).json({ user: publicUser(user), token: signToken(user) });
}));

router.post("/auth/login", asyncHandler(async (req, res) => {
  const data = parse(loginSchema, req.body);
  const user = await getDb().collection("users").findOne({ email: data.email });
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    return errorResponse(res, 401, "INVALID_CREDENTIALS", "Niepoprawny e-mail lub haslo");
  }
  if (user.status === "blocked") {
    return errorResponse(res, 403, "ACCOUNT_BLOCKED", "Konto zostalo zablokowane przez administratora");
  }
  res.json({ user: publicUser(user), token: signToken(user) });
}));

router.post("/auth/refresh", requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user), token: signToken(req.user) });
}));

router.post("/auth/logout", requireAuth, (_req, res) => {
  res.json({ ok: true });
});

router.get("/users/me", requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch("/users/me", requireAuth, asyncHandler(async (req, res) => {
  const schema = z.object({
    displayName: z.string().trim().min(2).max(80).optional(),
    bio: z.string().trim().max(400).optional(),
    avatarUrl: z.string().trim().url().or(z.literal("")).optional(),
  });
  const data = parse(schema, req.body);
  const $set = { updatedAt: now() };
  if (data.displayName !== undefined) $set["profile.displayName"] = data.displayName;
  if (data.bio !== undefined) $set["profile.bio"] = data.bio;
  if (data.avatarUrl !== undefined) $set["profile.avatarUrl"] = data.avatarUrl;
  await getDb().collection("users").updateOne(
    { _id: req.user._id },
    { $set },
  );
  const user = await getDb().collection("users").findOne({ _id: req.user._id });
  res.json({ user: publicUser(user) });
}));

router.get("/users/:username", asyncHandler(async (req, res) => {
  const user = await getDb().collection("users").findOne({ username: req.params.username }, { projection: { passwordHash: 0, email: 0 } });
  if (!user) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono uzytkownika");
  res.json({ user: publicUser(user) });
}));

router.get("/users/:username/recipes", asyncHandler(async (req, res) => {
  const user = await getDb().collection("users").findOne({ username: req.params.username });
  if (!user) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono uzytkownika");
  const recipes = await getDb().collection("recipes")
    .find({ authorId: user._id, status: "published" })
    .sort({ createdAt: -1 })
    .limit(60)
    .toArray();
  res.json({ items: recipes.map(recipeCard) });
}));

router.get("/categories", asyncHandler(async (_req, res) => {
  const items = await getDb().collection("categories").find({ isActive: { $ne: false } }).sort({ order: 1, name: 1 }).toArray();
  res.json({ items });
}));

router.post("/categories", requireAdmin, asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).default(""), order: z.coerce.number().int().default(100) });
  const data = parse(schema, req.body);
  const item = { ...data, slug: makeSlug(data.name), isActive: true };
  await getDb().collection("categories").insertOne(item);
  res.status(201).json({ item });
}));

router.patch("/categories/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const schema = z.object({ name: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(300).optional(), order: z.coerce.number().int().optional(), isActive: z.boolean().optional() });
  const data = parse(schema, req.body);
  if (data.name) data.slug = makeSlug(data.name);
  await getDb().collection("categories").updateOne({ _id: id }, { $set: data });
  res.json({ ok: true });
}));

router.get("/tags", asyncHandler(async (_req, res) => {
  const items = await getDb().collection("tags").find({}).sort({ usageCount: -1, name: 1 }).limit(80).toArray();
  res.json({ items });
}));

router.post("/tags", requireAdmin, asyncHandler(async (req, res) => {
  const schema = z.object({ name: z.string().trim().min(2).max(60) });
  const data = parse(schema, req.body);
  const item = { name: data.name, slug: makeSlug(data.name), usageCount: 0 };
  await getDb().collection("tags").insertOne(item);
  res.status(201).json({ item });
}));

router.get("/recipes", asyncHandler(async (req, res) => {
  const db = getDb();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(48, Math.max(1, Number(req.query.limit || 12)));
  
  // === MONGODB DYNAMIC QUERY DOCUMENT BUILDING ===
  // W MongoDB zapytania są dokumentami BSON. Dynamicznie budujemy ten dokument w zależności od filtrów z URL.
  const query = { status: "published" };
  const and = [];

  // 1. Text Search & Indeks Tekstowy: operator $text z $search wyszukuje frazę w polach objętych indeksem tekstowym (tytuł, opis, tagi)
  if (req.query.q) and.push({ $text: { $search: String(req.query.q) } });
  
  if (req.query.category) query.categorySlug = makeSlug(req.query.category);
  if (req.query.difficulty) query.difficulty = req.query.difficulty;
  
  // 2. Porównania Liczbowe ($lte / $gte): totalTimeMinutes <= maxTime oraz ratingAvg >= minRating
  if (req.query.maxTime) query.totalTimeMinutes = { $lte: Number(req.query.maxTime) };
  if (req.query.minRating) query.ratingAvg = { $gte: Number(req.query.minRating) };
  
  // 3. Tablice ($all): Wybiera dokumenty, których tablica "tags" zawiera WSZYSTKIE szukane elementy (Iloczyn zbiorów)
  const tags = cleanList(req.query.tags);
  if (tags.length) query.tags = { $all: tags };
  
  // 4. Tablice ($in): Wybiera dokumenty, których dieta należy do dowolnej z podanych w tablicy (Suma zbiorów)
  const diets = cleanList(req.query.diet || req.query.diets);
  if (diets.length) query.diets = { $in: diets };
  
  // 5. Zagnieżdżone Obiekty & Dot Notation: Przeszukuje tablicę zagnieżdżonych dokumentów składników
  // po polu normalizedName, co efektywnie wykorzystuje indeks typu Multi-Key w MongoDB
  const ingredients = cleanList(req.query.ingredients);
  if (ingredients.length) query["ingredients.normalizedName"] = { $all: ingredients };
  
  // 6. Operator logiczny $and: Łączy warunki w logiczną koniunkcję (wymagane przy wyszukiwaniu tekstowym z innymi filtrami)
  if (and.length) query.$and = and;

  const sortMap = {
    rating: { ratingAvg: -1, ratingCount: -1 },
    popular: { favoriteCount: -1, ratingCount: -1 },
    time: { totalTimeMinutes: 1 },
    newest: { createdAt: -1 },
  };
  const sort = sortMap[req.query.sort] || sortMap.newest;

  // === MONGODB QUERY OPTIMIZATION WITH CURSOR METHODS ===
  // Równolegle wykonujemy zapytanie pobierające dane oraz zliczające dokumenty (Promise.all)
  const [items, total] = await Promise.all([
    // .find(): Zwraca kursor z pasującymi dokumentami
    // .sort(): Wykonuje sortowanie (indeksowane pole chroni przed kosztownym sortowaniem w pamięci RAM)
    // .skip() oraz .limit(): Narzędzia do stronicowania, ograniczają transfer danych z bazy do aplikacji
    db.collection("recipes").find(query).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
    // .countDocuments(): Szybkie zliczanie pasujących dokumentów zoptymalizowane przez silnik bazy
    db.collection("recipes").countDocuments(query),
  ]);

  res.json({ items: items.map(recipeCard), page, limit, total, pages: Math.ceil(total / limit) });
}));

router.post("/recipes", requireAuth, asyncHandler(async (req, res) => {
  const data = parse(recipeSchema, req.body);
  const db = getDb();
  let category = null;
  if (data.categoryId) category = await db.collection("categories").findOne({ _id: oid(data.categoryId) });
  if (!category && data.categorySlug) category = await db.collection("categories").findOne({ slug: makeSlug(data.categorySlug) });
  if (!category) return errorResponse(res, 400, "INVALID_CATEGORY", "Niepoprawna kategoria");

  const tagSlugs = data.tags.map(makeSlug).filter(Boolean);
  const recipe = {
    authorId: req.user._id,
    authorSnapshot: {
      username: req.user.username,
      displayName: req.user.profile?.displayName || req.user.username,
      avatarUrl: req.user.profile?.avatarUrl || "",
    },
    categoryId: category._id,
    categorySlug: category.slug,
    title: data.title,
    slug: await uniqueSlug(db.collection("recipes"), data.title),
    description: data.description,
    ingredients: data.ingredients.map((item) => ({ ...item, normalizedName: makeSlug(normalizeText(item.name)) })),
    steps: data.steps.sort((a, b) => a.order - b.order),
    tags: tagSlugs,
    diets: data.diets.map(makeSlug).filter(Boolean),
    images: data.images.length ? data.images : [{ url: imageForCategory(category.slug), alt: data.title, isMain: true }],
    nutrition: data.nutrition,
    prepTimeMinutes: data.prepTimeMinutes,
    cookTimeMinutes: data.cookTimeMinutes,
    totalTimeMinutes: data.prepTimeMinutes + data.cookTimeMinutes,
    servings: data.servings,
    difficulty: data.difficulty,
    status: data.status,
    ratingAvg: 0,
    ratingCount: 0,
    commentCount: 0,
    favoriteCount: 0,
    createdAt: now(),
    updatedAt: now(),
  };
  // === MONGODB INSERT OPERATION ===
  // insertOne() dodaje nowy dokument przepisu do kolekcji i zwraca unikalny identyfikator _id (ObjectId)
  const result = await db.collection("recipes").insertOne(recipe);
  recipe._id = result.insertedId;
  await syncTags(db, tagSlugs);
  res.status(201).json({ item: recipeCard(recipe), recipe });
}));

router.get("/recipes/:slug", asyncHandler(async (req, res) => {
  const db = getDb();
  // === MONGODB SINGLE READ WITH INDEX ===
  // findOne() wyszukuje pojedynczy dokument po polu "slug", na którym leży indeks unikalny (Unique Index)
  const recipe = await db.collection("recipes").findOne({ slug: req.params.slug, status: "published" });
  if (!recipe) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono przepisu");
  
  // === MONGODB SORTED LIMIT QUERY ===
  // find() z .sort() i .limit(8) pobiera 8 najnowszych, widocznych komentarzy dla danego przepisu
  const comments = await db.collection("comments").find({ recipeId: recipe._id, status: "visible" }).sort({ createdAt: -1 }).limit(8).toArray();
  res.json({ recipe: { ...recipe, id: recipe._id.toString() }, comments });
}));

router.patch("/recipes/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const db = getDb();
  const existing = await db.collection("recipes").findOne({ _id: id });
  if (!existing) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono przepisu");
  if (!existing.authorId.equals(req.user._id) && req.user.role !== "admin") return errorResponse(res, 403, "FORBIDDEN", "Mozesz edytowac tylko wlasne przepisy");

  const data = parse(recipeSchema.partial(), req.body);
  const update = { updatedAt: now() };
  for (const key of Object.keys(data)) {
    if (req.body[key] !== undefined) {
      update[key] = data[key];
    }
  }

  if (update.title) update.slug = await uniqueSlug(db.collection("recipes"), update.title, id);
  if (update.ingredients) update.ingredients = update.ingredients.map((item) => ({ ...item, normalizedName: makeSlug(normalizeText(item.name)) }));
  if (update.steps) update.steps = update.steps.sort((a, b) => a.order - b.order);
  if (update.tags) update.tags = update.tags.map(makeSlug).filter(Boolean);
  if (update.diets) update.diets = update.diets.map(makeSlug).filter(Boolean);
  if (update.prepTimeMinutes !== undefined || update.cookTimeMinutes !== undefined) {
    update.totalTimeMinutes = (update.prepTimeMinutes ?? existing.prepTimeMinutes) + (update.cookTimeMinutes ?? existing.cookTimeMinutes);
  }
  await db.collection("recipes").updateOne({ _id: id }, { $set: update });
  if (update.tags) await syncTags(db, update.tags);
  res.json({ ok: true });
}));

router.delete("/recipes/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const recipe = await getDb().collection("recipes").findOne({ _id: id });
  if (!recipe) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono przepisu");
  if (!recipe.authorId.equals(req.user._id) && req.user.role !== "admin") return errorResponse(res, 403, "FORBIDDEN", "Mozesz usuwac tylko wlasne przepisy");
  await getDb().collection("recipes").updateOne({ _id: id }, { $set: { status: "draft", updatedAt: now() } });
  res.json({ ok: true });
}));

router.get("/recipes/:recipeId/comments", asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
  const items = await getDb().collection("comments").find({ recipeId, status: "visible" }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray();
  res.json({ items, page, limit });
}));

router.post("/recipes/:recipeId/comments", requireAuth, asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const { body } = parse(z.object({ body: z.string().trim().min(2).max(1000) }), req.body);
  const comment = {
    recipeId,
    userId: req.user._id,
    userSnapshot: { username: req.user.username, displayName: req.user.profile?.displayName || req.user.username },
    body,
    status: "visible",
    createdAt: now(),
    updatedAt: now(),
  };
  // === MONGODB TRANSACTIONAL ATOMICITY SIMULATION ===
  // 1. insertOne: Dodaje nowy komentarz do bazy danych.
  // 2. updateOne z operatorami modyfikacji $inc oraz $set:
  //    - Operator $inc (Increment) zwiększa atomowo licznik komentarzy (commentCount) w przepisie o 1.
  //    Dzięki temu unikamy kosztownego wczytywania, dodawania i ponownego zapisu całego przepisu.
  await getDb().collection("comments").insertOne(comment);
  await getDb().collection("recipes").updateOne({ _id: recipeId }, { $inc: { commentCount: 1 }, $set: { updatedAt: now() } });
  res.status(201).json({ item: comment });
}));

router.patch("/comments/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const comment = await getDb().collection("comments").findOne({ _id: id });
  if (!comment) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono komentarza");
  if (!comment.userId.equals(req.user._id) && req.user.role !== "admin") return errorResponse(res, 403, "FORBIDDEN", "Mozesz edytowac tylko wlasne komentarze");
  const { body } = parse(z.object({ body: z.string().trim().min(2).max(1000) }), req.body);
  await getDb().collection("comments").updateOne({ _id: id }, { $set: { body, updatedAt: now() } });
  res.json({ ok: true });
}));

router.delete("/comments/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const comment = await getDb().collection("comments").findOne({ _id: id });
  if (!comment) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono komentarza");
  if (!comment.userId.equals(req.user._id) && req.user.role !== "admin") return errorResponse(res, 403, "FORBIDDEN", "Mozesz usuwac tylko wlasne komentarze");
  
  // === MONGODB SOFT DELETE & COUNTER DECREMENT ===
  // 1. Zamiast fizycznego usunięcia rekordu z bazy, oznaczamy status komentarza jako "deleted" ($set).
  // 2. Dekrementujemy (zmniejszamy o 1) licznik komentarzy w powiązanym przepisie atomically ($inc: -1).
  await getDb().collection("comments").updateOne({ _id: id }, { $set: { status: "deleted", updatedAt: now() } });
  await getDb().collection("recipes").updateOne({ _id: comment.recipeId }, { $inc: { commentCount: -1 } });
  res.json({ ok: true });
}));

router.patch("/admin/comments/:id/status", requireAdmin, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  const { status } = parse(z.object({ status: z.enum(["visible", "hidden", "deleted"]) }), req.body);
  await getDb().collection("comments").updateOne({ _id: id }, { $set: { status, updatedAt: now() } });
  res.json({ ok: true });
}));

router.put("/recipes/:recipeId/rating", requireAuth, asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const { value } = parse(z.object({ value: z.coerce.number().int().min(1).max(5) }), req.body);
  // === MONGODB UPSERT WITH $setOnInsert ===
  // updateOne z opcją { upsert: true } (Update or Insert) realizuje logikę "dodaj lub edytuj":
  // Jeśli użytkownik ocenił już dany przepis (dopasowanie po kluczu unikalnym { recipeId, userId }),
  // ocena zostanie zaktualizowana ($set). Jeśli to pierwsza ocena – dokument zostanie automatycznie utworzony.
  // - Operator $set: Działa w obu przypadkach (aktualizuje ocenę i datę modyfikacji).
  // - Operator $setOnInsert: Ustawia pole createdAt TYLKO w przypadku tworzenia nowego dokumentu.
  await getDb().collection("ratings").updateOne(
    { recipeId, userId: req.user._id },
    { $set: { value, updatedAt: now() }, $setOnInsert: { createdAt: now() } },
    { upsert: true },
  );
  await recalculateRating(getDb(), recipeId);
  res.json({ ok: true });
}));

router.delete("/recipes/:recipeId/rating", requireAuth, asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  await getDb().collection("ratings").deleteOne({ recipeId, userId: req.user._id });
  await recalculateRating(getDb(), recipeId);
  res.json({ ok: true });
}));

router.get("/recipes/:recipeId/rating/me", requireAuth, asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const rating = await getDb().collection("ratings").findOne({ recipeId, userId: req.user._id });
  res.json({ rating });
}));

router.get("/me/favorites", requireAuth, asyncHandler(async (req, res) => {
  const items = await getDb().collection("favorites").find({ userId: req.user._id }).sort({ createdAt: -1 }).toArray();
  res.json({ items });
}));

router.post("/me/favorites/:recipeId", requireAuth, asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const recipe = await getDb().collection("recipes").findOne({ _id: recipeId });
  if (!recipe) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono przepisu");
  const favorite = {
    userId: req.user._id,
    recipeId,
    recipeSnapshot: {
      title: recipe.title,
      slug: recipe.slug,
      mainImageUrl: recipe.images?.[0]?.url || "",
      ratingAvg: recipe.ratingAvg || 0,
      totalTimeMinutes: recipe.totalTimeMinutes,
    },
    createdAt: now(),
  };
  try {
    await getDb().collection("favorites").insertOne(favorite);
    await getDb().collection("recipes").updateOne({ _id: recipeId }, { $inc: { favoriteCount: 1 } });
  } catch (err) {
    if (err.code !== 11000) throw err;
  }
  res.status(201).json({ ok: true });
}));

router.delete("/me/favorites/:recipeId", requireAuth, asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const deleted = await getDb().collection("favorites").deleteOne({ userId: req.user._id, recipeId });
  if (deleted.deletedCount) await getDb().collection("recipes").updateOne({ _id: recipeId }, { $inc: { favoriteCount: -1 } });
  res.json({ ok: true });
}));

router.get("/me/shopping-lists", requireAuth, asyncHandler(async (req, res) => {
  const items = await getDb().collection("shoppingLists").find({ userId: req.user._id }).sort({ updatedAt: -1 }).toArray();
  res.json({ items });
}));

router.post("/me/shopping-lists", requireAuth, asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(120),
    items: z.array(z.object({ name: z.string().trim().min(2), quantity: z.coerce.number().min(0), unit: z.string().trim().min(1), checked: z.boolean().default(false) })).min(1),
  });
  const data = parse(schema, req.body);
  const item = { userId: req.user._id, ...data, createdAt: now(), updatedAt: now() };
  await getDb().collection("shoppingLists").insertOne(item);
  res.status(201).json({ item });
}));

router.post("/recipes/:recipeId/shopping-list", requireAuth, asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const { servings } = parse(z.object({ servings: z.coerce.number().int().min(1).max(64) }), req.body);
  const recipe = await getDb().collection("recipes").findOne({ _id: recipeId });
  if (!recipe) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono przepisu");
  const multiplier = servings / recipe.servings;
  const list = {
    userId: req.user._id,
    name: `Zakupy: ${recipe.title}`,
    sourceRecipeId: recipeId,
    servings,
    items: recipe.ingredients.map((item) => ({
      name: item.name,
      quantity: Math.round(item.quantity * multiplier * 100) / 100,
      unit: item.unit,
      checked: false,
    })),
    createdAt: now(),
    updatedAt: now(),
  };
  await getDb().collection("shoppingLists").insertOne(list);
  res.status(201).json({ item: list });
}));

router.patch("/me/shopping-lists/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const schema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    items: z.array(z.object({ name: z.string().trim().min(2), quantity: z.coerce.number().min(0), unit: z.string().trim().min(1), checked: z.boolean().default(false) })).optional(),
  });
  const data = parse(schema, req.body);
  await getDb().collection("shoppingLists").updateOne({ _id: id, userId: req.user._id }, { $set: { ...data, updatedAt: now() } });
  res.json({ ok: true });
}));

router.delete("/me/shopping-lists/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  await getDb().collection("shoppingLists").deleteOne({ _id: id, userId: req.user._id });
  res.json({ ok: true });
}));

router.get("/me/meal-plans", requireAuth, asyncHandler(async (req, res) => {
  const query = { userId: req.user._id };
  if (req.query.from || req.query.to) {
    query.plannedFor = {};
    if (req.query.from) query.plannedFor.$gte = String(req.query.from);
    if (req.query.to) query.plannedFor.$lte = String(req.query.to);
  }
  const items = await getDb().collection("mealPlans").find(query).sort({ plannedFor: 1, mealType: 1 }).toArray();

  // Dynamically populate missing images for backward compatibility
  const recipeIds = [...new Set(items.filter(item => !item.recipeSnapshot?.image).map(item => item.recipeId))];
  if (recipeIds.length > 0) {
    const recipes = await getDb().collection("recipes").find({ _id: { $in: recipeIds } }).toArray();
    const recipeMap = new Map(recipes.map(r => [r._id.toString(), r]));
    for (const item of items) {
      if (item.recipeSnapshot && !item.recipeSnapshot.image) {
        const recipe = recipeMap.get(item.recipeId.toString());
        if (recipe) {
          item.recipeSnapshot.image = recipe.images?.find((img) => img.isMain)?.url || recipe.images?.[0]?.url || "";
        }
      }
    }
  }

  res.json({ items });
}));

router.post("/me/meal-plans", requireAuth, asyncHandler(async (req, res) => {
  const schema = z.object({
    recipeId: z.string(),
    plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    mealType: z.enum(["breakfast", "lunch", "dinner", "supper", "snack"]),
    servings: z.coerce.number().int().min(1).max(64),
  });
  const data = parse(schema, req.body);
  const recipeId = oid(data.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID przepisu");
  const recipe = await getDb().collection("recipes").findOne({ _id: recipeId });
  if (!recipe) return errorResponse(res, 404, "NOT_FOUND", "Nie znaleziono przepisu");
  const item = {
    userId: req.user._id,
    recipeId,
    recipeSnapshot: {
      title: recipe.title,
      slug: recipe.slug,
      totalTimeMinutes: recipe.totalTimeMinutes,
      image: recipe.images?.find((img) => img.isMain)?.url || recipe.images?.[0]?.url || ""
    },
    plannedFor: data.plannedFor,
    mealType: data.mealType,
    servings: data.servings,
    createdAt: now(),
  };
  await getDb().collection("mealPlans").insertOne(item);
  res.status(201).json({ item });
}));

router.patch("/me/meal-plans/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const schema = z.object({
    plannedFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    mealType: z.enum(["breakfast", "lunch", "dinner", "supper", "snack"]).optional(),
    servings: z.coerce.number().int().min(1).max(64).optional(),
  });
  const data = parse(schema, req.body);
  await getDb().collection("mealPlans").updateOne({ _id: id, userId: req.user._id }, { $set: data });
  res.json({ ok: true });
}));

router.delete("/me/meal-plans/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  await getDb().collection("mealPlans").deleteOne({ _id: id, userId: req.user._id });
  res.json({ ok: true });
}));

router.get("/admin/summary", requireAdmin, asyncHandler(async (_req, res) => {
  const db = getDb();
  const [
    users,
    admins,
    blockedUsers,
    recipes,
    publishedRecipes,
    hiddenRecipes,
    comments,
    hiddenComments,
    ratings,
    favorites,
    shoppingLists,
    mealPlans,
    reports,
    newestUsers,
    newestComments,
    topRecipes,
  ] = await Promise.all([
    // === MONGODB PERFORMANCE AND AGGREGATION VIA MULTIPLE QUERIES ===
    // Wypychamy do silnika bazy danych serię asynchronicznych zapytań zliczających (countDocuments)
    // oraz pobierających listy (find), wykonując je w pełni równolegle po stronie wątków bazy danych.
    db.collection("users").countDocuments({}),
    db.collection("users").countDocuments({ role: "admin" }),
    db.collection("users").countDocuments({ status: "blocked" }),
    db.collection("recipes").countDocuments({}),
    db.collection("recipes").countDocuments({ status: "published" }),
    db.collection("recipes").countDocuments({ status: "hidden" }),
    db.collection("comments").countDocuments({}),
    // Operator $ne: Not Equal – zlicza komentarze o statusie innym niż "visible" (ukryte i usunięte)
    db.collection("comments").countDocuments({ status: { $ne: "visible" } }),
    db.collection("ratings").countDocuments({}),
    db.collection("favorites").countDocuments({}),
    db.collection("shoppingLists").countDocuments({}),
    db.collection("mealPlans").countDocuments({}),
    db.collection("reports").countDocuments({ status: "new" }),
    // Projection (projekcja): projection: { passwordHash: 0 } to wykluczenie pola hasła ze zwracanego dokumentu
    // ze względów bezpieczeństwa (wyświetlamy profil użytkownika bez narażania jego skrótu hasła)
    db.collection("users").find({}, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(5).toArray(),
    db.collection("comments").find({}).sort({ createdAt: -1 }).limit(5).toArray(),
    // Projection & Multi-Field Sorting: Wybiera określone pola do podsumowania i sortuje malejąco po liczniku ulubień i ocenach
    db.collection("recipes").find({}, { projection: { title: 1, slug: 1, ratingAvg: 1, favoriteCount: 1, status: 1 } }).sort({ favoriteCount: -1, ratingAvg: -1 }).limit(5).toArray(),
  ]);

  res.json({
    stats: {
      users,
      admins,
      blockedUsers,
      recipes,
      publishedRecipes,
      hiddenRecipes,
      comments,
      hiddenComments,
      ratings,
      favorites,
      shoppingLists,
      mealPlans,
      openReports: reports,
    },
    newestUsers,
    newestComments,
    topRecipes,
  });
}));

router.get("/admin/users", requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
  const query = {};
  if (req.query.q) {
    const phrase = String(req.query.q).trim();
    query.$or = [
      { username: { $regex: phrase, $options: "i" } },
      { email: { $regex: phrase, $options: "i" } },
      { "profile.displayName": { $regex: phrase, $options: "i" } },
    ];
  }
  if (req.query.role) query.role = req.query.role;
  if (req.query.status) query.status = req.query.status;

  const [items, total] = await Promise.all([
    getDb().collection("users").find(query, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    getDb().collection("users").countDocuments(query),
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.patch("/admin/users/:id", requireAdmin, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  if (id.equals(req.user._id) && req.body.status === "blocked") {
    return errorResponse(res, 400, "INVALID_OPERATION", "Nie mozna zablokowac wlasnego konta");
  }
  const schema = z.object({
    role: z.enum(["user", "admin"]).optional(),
    status: z.enum(["active", "blocked"]).optional(),
  });
  const data = parse(schema, req.body);
  await getDb().collection("users").updateOne({ _id: id }, { $set: { ...data, updatedAt: now() } });
  res.json({ ok: true });
}));

router.get("/admin/comments", requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)));
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.q) query.body = { $regex: String(req.query.q).trim(), $options: "i" };
  const [items, total] = await Promise.all([
    getDb().collection("comments").find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    getDb().collection("comments").countDocuments(query),
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.get("/admin/recipes", requireAdmin, asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 40)));
  const query = {};
  if (req.query.status) query.status = req.query.status;
  if (req.query.q) query.title = { $regex: String(req.query.q).trim(), $options: "i" };
  const [items, total] = await Promise.all([
    getDb().collection("recipes").find(query, { projection: { ingredients: 0, steps: 0, nutrition: 0 } }).sort({ updatedAt: -1 }).skip((page - 1) * limit).limit(limit).toArray(),
    getDb().collection("recipes").countDocuments(query),
  ]);
  res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
}));

router.get("/admin/reports", requireAdmin, asyncHandler(async (_req, res) => {
  const items = await getDb().collection("reports").find({}).sort({ createdAt: -1 }).limit(100).toArray();
  res.json({ items });
}));

router.post("/recipes/:recipeId/reports", requireAuth, asyncHandler(async (req, res) => {
  const recipeId = oid(req.params.recipeId);
  if (!recipeId) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const { reason } = parse(z.object({ reason: z.string().trim().min(4).max(500) }), req.body);
  const item = { recipeId, userId: req.user._id, reason, status: "new", createdAt: now() };
  await getDb().collection("reports").insertOne(item);
  res.status(201).json({ item });
}));

router.patch("/admin/recipes/:id/status", requireAdmin, asyncHandler(async (req, res) => {
  const id = oid(req.params.id);
  if (!id) return errorResponse(res, 400, "INVALID_ID", "Niepoprawne ID");
  const { status } = parse(z.object({ status: z.enum(["draft", "published", "hidden"]) }), req.body);
  await getDb().collection("recipes").updateOne({ _id: id }, { $set: { status, updatedAt: now() } });
  res.json({ ok: true });
}));

function imageForCategory(slug) {
  const images = {
    sniadania: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=1200&q=80",
    obiady: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
    desery: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80",
    wegetarianskie: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=80",
  };
  return images[slug] || "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&w=1200&q=80";
}

async function syncTags(db, tags) {
  await Promise.all(tags.map((slug) => db.collection("tags").updateOne(
    { slug },
    { $setOnInsert: { name: slug.replace(/-/g, " "), slug }, $inc: { usageCount: 1 } },
    { upsert: true },
  )));
}

router.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  if (err.message === "VALIDATION_ERROR") {
    return errorResponse(res, err.status || 400, "VALIDATION_ERROR", "Niepoprawne dane wejsciowe", err.details);
  }
  if (err.code === 11000) {
    return errorResponse(res, 409, "DUPLICATE_KEY", "Taki rekord juz istnieje");
  }
  console.error(err);
  return errorResponse(res, 500, "SERVER_ERROR", "Wystapil blad serwera");
});

module.exports = router;
