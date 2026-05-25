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

function createApp() {
  const app = express();
  app.disable("x-powered-by");
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
  app.use(cors({ origin: true, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: false }));
  app.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: isProduction ? 300 : 2000 }));
  app.use(morgan(isProduction ? "combined" : "dev"));
  app.use(optionalAuth);

  app.use("/api", routes);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Nie znaleziono endpointu API" } });
  });
  app.use(express.static(publicDir, { maxAge: isProduction ? "1h" : 0 }));
  app.get("/{*splat}", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));

  return app;
}

async function start() {
  await connectDb();
  const app = createApp();

  app.listen(port, () => {
    console.log(`Aplikacja dziala: http://localhost:${port}`);
  });
}

if (require.main === module) {
  start().catch((err) => {
    console.error("Nie udalo sie uruchomic aplikacji", err);
    process.exit(1);
  });
}

module.exports = { createApp, start };
