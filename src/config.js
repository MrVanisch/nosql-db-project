/**
 * Modul konfiguracyjny aplikacji.
 * Odpowiada za ladowanie zmiennych srodowiskowych z pliku .env
 * oraz ich walidacje pod katem wymaganych pol.
 */
const path = require("path");
require("dotenv").config();

// Lista wymaganych zmiennych srodowiskowych
const required = ["MONGODB_URI", "JWT_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Brak wymaganej zmiennej srodowiskowej: ${key}`);
  }
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGODB_URI,
  mongoDbName: process.env.MONGODB_DB_NAME || "recipes_app",
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  publicDir: path.join(__dirname, "..", "public"),
  isProduction: process.env.NODE_ENV === "production",
};
