const { connectDb } = require("./db");
const { hashPassword, makeSlug, normalizeText, now } = require("./utils");
const crypto = require("crypto");

const categories = [
  { name: "Sniadania", slug: "sniadania", description: "Energetyczny start dnia", order: 10, isActive: true },
  { name: "Obiady", slug: "obiady", description: "Dania glowne na co dzien", order: 20, isActive: true },
  { name: "Desery", slug: "desery", description: "Slodkie przepisy i wypieki", order: 30, isActive: true },
  { name: "Wegetarianskie", slug: "wegetarianskie", description: "Bez miesa, pelne smaku", order: 40, isActive: true },
];

const images = {
  sniadania: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=1200&q=80",
  obiady: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
  desery: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80",
  wegetarianskie: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=80",
};

const recipes = [
  {
    categorySlug: "obiady",
    title: "Makaron z kurczakiem i szpinakiem",
    description: "Szybki obiad w kremowym sosie, dobry na zabiegany dzien.",
    ingredients: [["makaron penne", 250, "g"], ["piers z kurczaka", 300, "g"], ["szpinak", 120, "g"], ["smietanka", 150, "ml"]],
    steps: ["Ugotuj makaron al dente.", "Podsmaz kurczaka z przyprawami.", "Dodaj szpinak i smietanke, a potem wymieszaj z makaronem."],
    tags: ["makaron", "szybki-obiad", "kurczak"],
    diets: ["high-protein"],
    prepTimeMinutes: 10,
    cookTimeMinutes: 20,
    servings: 2,
    difficulty: "easy",
    nutrition: { calories: 620, protein: 38, fat: 22, carbs: 68 },
    ratingAvg: 4.7,
    ratingCount: 31,
    favoriteCount: 54,
  },
  {
    categorySlug: "wegetarianskie",
    title: "Bowl z ciecierzyca i warzywami",
    description: "Kolorowa miska z chrupiacymi warzywami, kasza i sosem jogurtowym.",
    ingredients: [["ciecierzyca", 240, "g"], ["kasza bulgur", 160, "g"], ["ogorek", 1, "szt"], ["jogurt naturalny", 120, "g"]],
    steps: ["Ugotuj kasze.", "Podpiecz ciecierzyce z papryka wedzona.", "Pokroj warzywa i uloz wszystko w misce."],
    tags: ["fit", "wegetarianskie", "lunch"],
    diets: ["vegetarian"],
    prepTimeMinutes: 15,
    cookTimeMinutes: 15,
    servings: 2,
    difficulty: "easy",
    nutrition: { calories: 510, protein: 21, fat: 14, carbs: 74 },
    ratingAvg: 4.5,
    ratingCount: 18,
    favoriteCount: 32,
  },
  {
    categorySlug: "sniadania",
    title: "Owsianka z malinami i orzechami",
    description: "Kremowa owsianka z owocami, dobra do przygotowania w kilka minut.",
    ingredients: [["platki owsiane", 80, "g"], ["mleko", 250, "ml"], ["maliny", 100, "g"], ["orzechy wloskie", 20, "g"]],
    steps: ["Gotuj platki z mlekiem przez kilka minut.", "Dodaj owoce i orzechy.", "Podawaj od razu albo zapakuj na wynos."],
    tags: ["sniadanie", "szybkie", "owsianka"],
    diets: ["vegetarian"],
    prepTimeMinutes: 5,
    cookTimeMinutes: 8,
    servings: 1,
    difficulty: "easy",
    nutrition: { calories: 430, protein: 15, fat: 16, carbs: 58 },
    ratingAvg: 4.8,
    ratingCount: 22,
    favoriteCount: 41,
  },
  {
    categorySlug: "desery",
    title: "Sernik na zimno z borowkami",
    description: "Lekki deser bez pieczenia z jogurtem, twarogiem i owocowa warstwa.",
    ingredients: [["twarog", 500, "g"], ["jogurt grecki", 250, "g"], ["zelatyna", 16, "g"], ["borowki", 200, "g"]],
    steps: ["Przygotuj spod z pokruszonych ciastek.", "Wymieszaj mase serowa i dodaj zelatyne.", "Schlodz ciasto i udekoruj borowkami."],
    tags: ["deser", "bez-pieczenia", "sernik"],
    diets: ["vegetarian"],
    prepTimeMinutes: 25,
    cookTimeMinutes: 0,
    servings: 8,
    difficulty: "medium",
    nutrition: { calories: 360, protein: 18, fat: 19, carbs: 29 },
    ratingAvg: 4.6,
    ratingCount: 14,
    favoriteCount: 27,
  },
];

async function run() {
  const db = await connectDb();
  const createdAt = now();

  await db.collection("categories").bulkWrite(categories.map((category) => ({
    updateOne: { filter: { slug: category.slug }, update: { $set: category }, upsert: true },
  })));

  const demoPassword = process.env.DEMO_ADMIN_PASSWORD || crypto.randomBytes(18).toString("base64url");
  const passwordHash = await hashPassword(demoPassword);
  const admin = {
    username: "admin",
    email: "admin@example.com",
    passwordHash,
    role: "admin",
    profile: { displayName: "Administrator", bio: "Konto demonstracyjne", avatarUrl: "" },
    createdAt,
    updatedAt: createdAt,
  };
  await db.collection("users").updateOne({ email: admin.email }, { $setOnInsert: admin }, { upsert: true });
  const user = await db.collection("users").findOne({ email: admin.email });

  for (const item of recipes) {
    const category = await db.collection("categories").findOne({ slug: item.categorySlug });
    const document = {
      authorId: user._id,
      authorSnapshot: { username: user.username, displayName: user.profile.displayName, avatarUrl: "" },
      categoryId: category._id,
      categorySlug: category.slug,
      title: item.title,
      slug: makeSlug(item.title),
      description: item.description,
      ingredients: item.ingredients.map(([name, quantity, unit]) => ({ name, normalizedName: makeSlug(normalizeText(name)), quantity, unit, note: "" })),
      steps: item.steps.map((instruction, index) => ({ order: index + 1, instruction, durationMinutes: index === 0 ? 8 : 5 })),
      tags: item.tags.map(makeSlug),
      diets: item.diets.map(makeSlug),
      images: [{ url: images[item.categorySlug], alt: item.title, isMain: true }],
      nutrition: item.nutrition,
      prepTimeMinutes: item.prepTimeMinutes,
      cookTimeMinutes: item.cookTimeMinutes,
      totalTimeMinutes: item.prepTimeMinutes + item.cookTimeMinutes,
      servings: item.servings,
      difficulty: item.difficulty,
      status: "published",
      ratingAvg: item.ratingAvg,
      ratingCount: item.ratingCount,
      commentCount: 0,
      favoriteCount: item.favoriteCount,
      createdAt,
      updatedAt: createdAt,
    };
    await db.collection("recipes").updateOne({ slug: document.slug }, { $setOnInsert: document }, { upsert: true });
    for (const slug of document.tags) {
      await db.collection("tags").updateOne(
        { slug },
        { $setOnInsert: { name: slug.replace(/-/g, " "), slug }, $inc: { usageCount: 1 } },
        { upsert: true },
      );
    }
  }

  console.log("Seed zakonczony. Demo login: admin@example.com");
  if (!process.env.DEMO_ADMIN_PASSWORD) {
    console.log(`Wygenerowane haslo demo dla nowej bazy: ${demoPassword}`);
    console.log("Zapisz je lokalnie. Nie commituj hasel do repozytorium.");
  }
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
