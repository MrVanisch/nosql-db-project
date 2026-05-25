const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const { mongoUri, mongoDbName } = require("./config");

let client;
let database;

/**
 * Nawiązuje połączenie z bazą danych MongoDB.
 * Implementuje wzorzec Singleton dla połączenia z bazą oraz konfiguruje Connection Pool.
 * 
 * @async
 * @returns {Promise<import('mongodb').Db>} Instancja bazy danych MongoDB.
 */
async function connectDb() {
  if (database) return database;

  // === MONGODB CLIENT & CONNECTION POOLING ===
  // Tworzymy instancję klienta MongoDB z optymalną konfiguracją dla połączenia produkcyjnego.
  // Connection Pooling jest kluczowy w NoSQL, aby uniknąć narzutu na wielokrotne nawiązywanie połączeń TCP/SSL.
  client = new MongoClient(mongoUri, {
    dbName: mongoDbName,
    tls: true, // Zapewnia szyfrowanie połączenia SSL/TLS
    maxPoolSize: 20, // Konfiguruje Connection Pool (pula połączeń) – pozwala na równoległą obsługę do 20 zapytań bez narzutu na handshaking
    serverSelectionTimeoutMS: 8000, // Czas oczekiwania na wybór serwera w klastrze przed zgłoszeniem błędu
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
  });

  await client.connect();
  database = client.db(mongoDbName);
  
  // Automatycznie dbamy o wdrożenie zaplanowanych indeksów po połączeniu.
  // W NoSQL indeksy są niezbędne do uniknięcia kosztownych operacji COLLSCAN (przeszukiwania całej kolekcji).
  await ensureIndexes(database);
  return database;
}

/**
 * Zwraca aktywną instancję bazy danych. Rzuca błąd, jeśli połączenie nie zostało nawiązane.
 * 
 * @returns {import('mongodb').Db} Instancja bazy danych.
 * @throws {Error} Gdy baza nie jest jeszcze połączona.
 */
function getDb() {
  if (!database) {
    throw new Error("Database is not connected yet");
  }
  return database;
}

/**
 * Pomocnicza funkcja do konwersji ciągu tekstowego na typ ObjectId.
 * ObjectId to 12-bajtowy identyfikator używany przez MongoDB jako domyślny klucz główny (_id).
 * 
 * @param {string} value - Ciąg tekstowy do konwersji.
 * @returns {ObjectId|null} Obiekt ObjectId lub null, jeśli format jest nieprawidłowy.
 */
function oid(value) {
  if (!ObjectId.isValid(value)) return null;
  return new ObjectId(value);
}

/**
 * Konfiguruje indeksy dla wszystkich kolekcji w bazie danych.
 * Indeksy w MongoDB działają podobnie do indeksów w relacyjnych bazach danych (B-Tree),
 * ale wspierają też specyficzne dla NoSQL wzorce jak Multi-Key (dla tablic) czy indeksy tekstowe.
 * 
 * @async
 * @param {import('mongodb').Db} db - Instancja bazy danych.
 */
async function ensureIndexes(db) {
  await Promise.all([
    // 1. Indeksy unikalne (Unique Indexes) – gwarantują spójność danych i brak duplikatów po stronie bazy (zastępują klucze unikalne z SQL)
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("recipes").createIndex({ slug: 1 }, { unique: true }),

    // 2. Indeksy złożone (Compound Indexes) – optymalizują zapytania filtrujące po jednym polu i sortujące po drugim.
    // Ważna jest kolejność pól (Equality, Sort, Range - reguła ESR).
    db.collection("recipes").createIndex({ authorId: 1, createdAt: -1 }),
    db.collection("recipes").createIndex({ categorySlug: 1, ratingAvg: -1 }),

    // 3. Indeksy wielokluczowe (Multi-Key Indexes) – automatycznie indeksują każdy element tablicy.
    // Umożliwia to wydajne zapytania typu "znajdź przepisy z tagiem X".
    db.collection("recipes").createIndex({ tags: 1, ratingAvg: -1 }),
    db.collection("recipes").createIndex({ diets: 1, totalTimeMinutes: 1 }),

    // 4. Dot Notation Multi-Key Index – indeksowanie pola wewnątrz tablicy zagnieżdżonych dokumentów (składników).
    // Pozwala na szybkie wyszukiwanie dokumentów na podstawie właściwości ich dzieci.
    db.collection("recipes").createIndex({ "ingredients.normalizedName": 1 }),
    db.collection("recipes").createIndex({ status: 1, createdAt: -1 }),

    // 5. Złożony indeks tekstowy (Compound Text Index) – umożliwia zaawansowane wyszukiwanie pełnotekstowe
    // po tytule, opisie, tagach i składnikach za pomocą operatora $text. Kolekcja może mieć tylko jeden indeks tekstowy!
    db.collection("recipes").createIndex({
      title: "text",
      description: "text",
      tags: "text",
      "ingredients.normalizedName": "text",
    }),

    db.collection("categories").createIndex({ slug: 1 }, { unique: true }),
    db.collection("categories").createIndex({ isActive: 1, order: 1 }),
    db.collection("tags").createIndex({ slug: 1 }, { unique: true }),
    db.collection("tags").createIndex({ usageCount: -1 }),

    db.collection("comments").createIndex({ recipeId: 1, createdAt: -1 }),
    db.collection("comments").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("comments").createIndex({ status: 1 }),

    // 6. Złożone indeksy unikalne (Compound Unique Indexes) – zapobiegają np. wielokrotnemu ocenieniu tego samego przepisu przez jednego użytkownika.
    // Jest to kluczowe dla zapewnienia integralności danych bez konieczności stosowania transakcji ACID w każdym przypadku.
    db.collection("ratings").createIndex({ recipeId: 1, userId: 1 }, { unique: true }),
    db.collection("ratings").createIndex({ recipeId: 1 }),

    db.collection("favorites").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("favorites").createIndex({ userId: 1, recipeId: 1 }, { unique: true }),

    db.collection("shoppingLists").createIndex({ userId: 1, updatedAt: -1 }),
    db.collection("mealPlans").createIndex({ userId: 1, plannedFor: 1 }),
    db.collection("mealPlans").createIndex({ userId: 1, plannedFor: 1, mealType: 1 }),
  ]);
}

module.exports = { connectDb, getDb, oid, ensureIndexes };

