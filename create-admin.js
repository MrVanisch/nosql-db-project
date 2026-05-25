/**
 * Skrypt pomocniczy do manualnego tworzenia konta administratora.
 * Uzyteczny w sytuacjach, gdy chcemy dodac dodatkowego administratora
 * bez korzystania z glownego skryptu seedujacego.
 */
const { connectDb } = require("./src/db");
const { hashPassword, now } = require("./src/utils");

async function createAdmin() {
  const db = await connectDb();
  
  const adminEmail = "admin2@example.com";
  const password = "AdminPassword123!";
  
  // Sprawdzenie, czy administrator o podanym emailu juz istnieje
  const existing = await db.collection("users").findOne({ email: adminEmail });
  if (existing) {
    console.log("Konto administratora juz istnieje.");
    process.exit(0);
  }

  const user = {
    username: "admin_super",
    email: adminEmail,
    passwordHash: await hashPassword(password),
    role: "admin",
    profile: {
      displayName: "Główny Administrator",
      bio: "",
      avatarUrl: "",
    },
    createdAt: now(),
    updatedAt: now(),
  };

  await db.collection("users").insertOne(user);
  console.log(`Konto administratora utworzone! Email: ${adminEmail}, Haslo: ${password}`);
  process.exit(0);
}

createAdmin().catch(console.error);
