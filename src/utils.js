const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const slugify = require("slugify");
const { jwtSecret, jwtExpiresIn } = require("./config");

function now() {
  return new Date();
}

function makeSlug(value) {
  return slugify(value, { lower: true, strict: true, locale: "pl" });
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function signToken(user) {
  return jwt.sign(
    { sub: user._id.toString(), username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: jwtExpiresIn },
  );
}

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
    image: recipe.images?.find((image) => image.isMain)?.url || recipe.images?.[0]?.url || "",
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
