const jwt = require("jsonwebtoken");
const { getDb, oid } = require("./db");
const { jwtSecret } = require("./config");

/**
 * Wrapper dla asynchronicznych funkcji obsługi żądań Express (Route Handlers).
 * Przechwytuje błędy i przekazuje je do globalnego mechanizmu obsługi błędów next(err).
 * 
 * @param {Function} fn - Asynchroniczna funkcja do owinięcia.
 * @returns {Function} Funkcja middleware zgodna z Express.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/**
 * Formatuje i wysyła ustandaryzowaną odpowiedź błędu.
 * 
 * @param {import('express').Response} res - Obiekt odpowiedzi Express.
 * @param {number} status - Kod statusu HTTP (np. 404, 500).
 * @param {string} code - Wewnętrzny kod błędu (np. 'NOT_FOUND').
 * @param {string} message - Czytelny opis błędu.
 * @param {any} [details] - Dodatkowe szczegóły błędu (np. błędy walidacji).
 * @returns {import('express').Response} Odpowiedź JSON.
 */
function errorResponse(res, status, code, message, details) {
  return res.status(status).json({ error: { code, message, details } });
}

/**
 * Middleware opcjonalnej autentykacji. Sprawdza obecność tokenu JWT w nagłówku Authorization.
 * Jeśli token jest prawidłowy, dołącza dokument użytkownika do obiektu żądania (req.user).
 * Jeśli tokenu brak lub jest błędny, proces toczy się dalej bez przypisania użytkownika.
 * 
 * @async
 * @param {import('express').Request} req - Obiekt żądania Express.
 * @param {import('express').Response} _res - Obiekt odpowiedzi Express.
 * @param {import('express').NextFunction} next - Funkcja przejścia do kolejnego middleware.
 */
async function optionalAuth(req, _res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return next();

  try {
    const payload = jwt.verify(token, jwtSecret);
    const userId = oid(payload.sub);
    if (userId) {
      // Pobieramy pełny dokument użytkownika z bazy, aby mieć dostęp do roli i statusu.
      // W systemach o dużej skali można rozważyć cache'owanie tych danych w Redis.
      req.user = await getDb().collection("users").findOne({ _id: userId });
    }
  } catch {
    // W przypadku błędu weryfikacji tokenu (np. wygaśnięcie), traktujemy użytkownika jako niezalogowanego.
    req.user = null;
  }
  next();
}

/**
 * Middleware wymagający autentykacji. Blokuje dostęp dla użytkowników niezalogowanych
 * lub zablokowanych przez administratora.
 * 
 * @param {import('express').Request} req - Obiekt żądania Express.
 * @param {import('express').Response} res - Obiekt odpowiedzi Express.
 * @param {import('express').NextFunction} next - Funkcja przejścia do kolejnego middleware.
 */
function requireAuth(req, res, next) {
  if (!req.user) {
    return errorResponse(res, 401, "UNAUTHORIZED", "Wymagane logowanie");
  }
  if (req.user.status === "blocked") {
    return errorResponse(res, 403, "ACCOUNT_BLOCKED", "Konto zostalo zablokowane przez administratora");
  }
  next();
}

/**
 * Middleware wymagający uprawnień administratora. 
 * Rozszerza requireAuth o sprawdzenie roli użytkownika.
 * 
 * @param {import('express').Request} req - Obiekt żądania Express.
 * @param {import('express').Response} res - Obiekt odpowiedzi Express.
 * @param {import('express').NextFunction} next - Funkcja przejścia do kolejnego middleware.
 */
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

