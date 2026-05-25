const { MongoClient, ObjectId, ServerApiVersion } = require("mongodb");
const { mongoUri, mongoDbName } = require("./config");

let client;
let database;

async function connectDb() {
  if (database) return database;

  client = new MongoClient(mongoUri, {
    dbName: mongoDbName,
    tls: true,
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 8000,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
  });

  await client.connect();
  database = client.db(mongoDbName);
  await ensureIndexes(database);
  return database;
}

function getDb() {
  if (!database) {
    throw new Error("Database is not connected yet");
  }
  return database;
}

function oid(value) {
  if (!ObjectId.isValid(value)) return null;
  return new ObjectId(value);
}

async function ensureIndexes(db) {
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("users").createIndex({ username: 1 }, { unique: true }),
    db.collection("recipes").createIndex({ slug: 1 }, { unique: true }),
    db.collection("recipes").createIndex({ authorId: 1, createdAt: -1 }),
    db.collection("recipes").createIndex({ categorySlug: 1, ratingAvg: -1 }),
    db.collection("recipes").createIndex({ tags: 1, ratingAvg: -1 }),
    db.collection("recipes").createIndex({ diets: 1, totalTimeMinutes: 1 }),
    db.collection("recipes").createIndex({ "ingredients.normalizedName": 1 }),
    db.collection("recipes").createIndex({ status: 1, createdAt: -1 }),
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
