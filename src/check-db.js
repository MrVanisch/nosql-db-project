/**
 * Skrypt diagnostyczny do sprawdzenia polaczenia z baza danych MongoDB.
 * Wykonuje "ping" do bazy, aby potwierdzic poprawnosc konfiguracji i uprawnien sieciowych.
 */
const { connectDb } = require("./db");
const { mongoDbName, mongoUri } = require("./config");

// Funkcja maskujaca haslo w URI dla celow bezpiecznego logowania
function maskUri(uri) {
  return uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

async function run() {
  console.log(`Sprawdzanie polaczenia z: ${maskUri(mongoUri)}`);
  console.log(`Baza danych: ${mongoDbName}`);
  
  const db = await connectDb();
  const ping = await db.command({ ping: 1 });
  
  console.log("Polaczenie z MongoDB nawiazane pomyslnie:", ping);
  process.exit(0);
}

run().catch((err) => {
  console.error("Blad polaczenia z MongoDB.");
  console.error(err.message);
  
  // Obsluga czestego bledu zwiazanego z brakiem adresu IP na liscie dozwolonych (Atlas)
  if (String(err.message).includes("tlsv1 alert internal error")) {
    console.error("");
    console.error("Handshake TLS zostal odrzucony przed uwierzytelnieniem.");
    console.error("Sprawdz 'Network Access' w MongoDB Atlas i dodaj publiczny adres IP tej maszyny.");
  }
  process.exit(1);
});
