const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const path = require("path");
const { connectDb } = require("./db");
const { optionalAuth } = require("./middleware");
const routes = require("./routes");
const { port, publicDir, isProduction } = require("./config");

/**
 * Konfiguruje i tworzy instancję aplikacji Express.
 * Zawiera definicje middleware bezpieczeństwa, optymalizacji oraz tras API.
 * 
 * @returns {import('express').Application} Skonfigurowana aplikacja Express.
 */
function createApp() {
  const app = express();

  // Wyłączenie nagłówka X-Powered-By ze względów bezpieczeństwa (utrudnia identyfikację technologii)
  app.disable("x-powered-by");

  // Helmet pomaga zabezpieczyć aplikację poprzez ustawienie różnych nagłówków HTTP.
  // CSP (Content Security Policy) ogranicza źródła, z których można ładować zasoby.
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
      },
    },
  }));

  // CORS umożliwia bezpieczne żądania z innych domen (np. frontendu działającego na innym porcie)
  app.use(cors({ origin: true, credentials: true }));

  // Kompresja Gzip redukuje rozmiar przesyłanych danych (JSON, HTML, CSS)
  app.use(compression());

  // Parsowanie ciała żądań JSON i URL-encoded z ograniczeniem rozmiaru dla ochrony przed atakami DoS
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));

  // Rate Limiting zapobiega nadużyciom API i atakom Brute Force
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: isProduction ? 300 : 2000 }));

  // Logowanie żądań HTTP (w produkcji format 'combined', w deweloperce 'dev')
  app.use(morgan(isProduction ? "combined" : "dev"));

  // Middleware sprawdzający opcjonalną sesję użytkownika dla każdego żądania
  app.use(optionalAuth);

  // Główny router API
  app.use("/api", routes);

  // Obsługa błędów 404 dla endpointów API
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Nie znaleziono endpointu API" } });
  });

  // Serwowanie plików statycznych z folderu public (frontend)
  app.use(express.static(publicDir, { maxAge: isProduction ? "1h" : 0 }));

  // Catch-all route dla Single Page Application (SPA) – przekierowuje wszystkie nieznane ścieżki do index.html
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

  return app;
}

/**
 * Uruchamia proces startu serwera: łączy się z bazą danych, a następnie nasłuchuje na porcie.
 * 
 * @async
 */
async function start() {
  // Najpierw nawiązujemy połączenie z MongoDB, co zainicjuje też indeksy
  await connectDb();
  
  const app = createApp();

  app.listen(port, () => {
    console.log(`Aplikacja dziala: http://localhost:${port}`);
  });
}

// Jeśli plik jest uruchamiany bezpośrednio, wywołujemy funkcję start
if (require.main === module) {
  start().catch((err) => {
    console.error("Nie udalo sie uruchomic aplikacji", err);
    process.exit(1);
  });
}

module.exports = { createApp, start };

