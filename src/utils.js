const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const slugify = require("slugify");
const { jwtSecret, jwtExpiresIn } = require("./config");

/**
 * Zwraca bieżącą datę i godzinę.
 * 
 * @returns {Date} Aktualna data.
 */
function now() {
  return new Date();
}

/**
 * Generuje "slug" (przyjazny URL) z podanego ciągu tekstowego.
 * Obsługuje polskie znaki i zamienia je na ich łacińskie odpowiedniki.
 * 
 * @param {string} value - Tekst do przekształcenia.
 * @returns {string} Wygenerowany slug.
 */
function makeSlug(value) {
  return slugify(value, { lower: true, strict: true, locale: "pl" });
}

/**
 * Normalizuje tekst do celów wyszukiwania: usuwa znaki diakrytyczne, 
 * zamienia na małe litery i usuwa zbędne białe znaki.
 * 
 * @param {string} value - Tekst do normalizacji.
 * @returns {string} Znormalizowany tekst.
 */
function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Haszuje hasło użytkownika przy użyciu algorytmu bcrypt.
 * 
 * @async
 * @param {string} password - Hasło w formie czystego tekstu.
 * @returns {Promise<string>} Zahaszowane hasło.
 */
async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

/**
 * Weryfikuje czy podane hasło zgadza się z zahaszowanym wzorcem.
 * 
 * @async
 * @param {string} password - Hasło do sprawdzenia.
 * @param {string} hash - Zahaszowane hasło z bazy danych.
 * @returns {Promise<boolean>} True, jeśli hasła są zgodne.
 */
async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

/**
 * Generuje token JWT dla zalogowanego użytkownika.
 * 
 * @param {Object} user - Dokument użytkownika.
 * @returns {string} Wygenerowany token JWT.
 */
function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: jwtExpiresIn },
  );
}

/**
 * Mapuje pełny dokument użytkownika na obiekt bezpieczny do wysłania klientowi (bez hasła).
 * 
 * @param {Object} user - Dokument użytkownika z bazy.
 * @returns {Object|null} Publiczny profil użytkownika.
 */
function publicUser(user) {
  if (!user) return null;
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    role: user.role,
    profile: user.profile || {},
    createdAt: user.createdAt,
  };
}

/**
 * Przekształca dokument przepisu na uproszczony format "karty" (Recipe Card).
 * Implementuje wzorzec denormalizacji (authorSnapshot) dla poprawy wydajności odczytu.
 * 
 * @param {Object} recipe - Dokument przepisu z bazy.
 * @returns {Object} Zmapowany obiekt karty przepisu.
 */
function recipeCard(recipe) {
  return {
    id: recipe._id.toString(),
    slug: recipe.slug,
    title: recipe.title,
    description: recipe.description,
    categorySlug: recipe.categorySlug,
    tags: recipe.tags || [],
    diets: recipe.diets || [],
    difficulty: recipe.difficulty,
    ratingAvg: recipe.ratingAvg || 0,
    ratingCount: recipe.ratingCount || 0,
    commentCount: recipe.commentCount || 0,
    favoriteCount: recipe.favoriteCount || 0,
    totalTimeMinutes: recipe.totalTimeMinutes || 0,
    servings: recipe.servings,
    // Wybór głównego zdjęcia lub pierwszego dostępnego
    image: recipe.images?.find((image) => image.isMain)?.url || recipe.images?.[0]?.url || "",
    // Wzorzec Denormalizacji: Przechowujemy snapshot danych autora bezpośrednio w przepisie.
    // Dzięki temu przy wyświetlaniu listy przepisów nie musimy wykonywać JOIN-ów (lookup) do kolekcji users.
    author: recipe.authorSnapshot,
    createdAt: recipe.createdAt,
  };
}

module.exports = {
  now,
  makeSlug,
  normalizeText,
  hashPassword,
  verifyPassword,
  signToken,
  publicUser,
  recipeCard,
};

