const { connectDb } = require("./db");
const { mongoDbName, mongoUri } = require("./config");

function maskUri(uri) {
  return uri.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");
}

async function run() {
  console.log(`Mongo URI: ${maskUri(mongoUri)}`);
  console.log(`Mongo DB: ${mongoDbName}`);
  const db = await connectDb();
  const ping = await db.command({ ping: 1 });
  console.log("MongoDB ping OK:", ping);
  process.exit(0);
}

run().catch((err) => {
  console.error("MongoDB connection failed.");
  console.error(err.message);
  if (String(err.message).includes("tlsv1 alert internal error")) {
    console.error("");
    console.error("TLS handshake is rejected before authentication.");
    console.error("Check MongoDB Atlas Network Access and add this machine public IP.");
    console.error("Find your current public IP and add it in Atlas before retrying.");
  }
  process.exit(1);
});
