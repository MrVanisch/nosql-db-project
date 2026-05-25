const jwt = require("jsonwebtoken");
const { getDb, oid } = require("./db");
const { jwtSecret } = require("./config");

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorResponse(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, details } });
}

async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, jwtSecret);
    const userId = oid(payload.sub);
    if (userId) {
      req.user = await getDb().collection("users").findOne({ _id: userId });
    }
  } catch {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 401, "UNAUTHORIZED", "Wymagane logowanie");
  }
  if (req.user.status === "blocked") {
    return errorResponse(res, 403, "ACCOUNT_BLOCKED", "Konto zostalo zablokowane przez administratora");
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 401, "UNAUTHORIZED", "Wymagane logowanie");
  }
  if (req.user.status === "blocked") {
    return errorResponse(res, 403, "ACCOUNT_BLOCKED", "Konto zostalo zablokowane przez administratora");
  }
  if (req.user.role !== "admin") {
    return errorResponse(res, 403, "FORBIDDEN", "Wymagane uprawnienia administratora");
  }
  next();
}

module.exports = { asyncHandler, errorResponse, optionalAuth, requireAuth, requireAdmin };
