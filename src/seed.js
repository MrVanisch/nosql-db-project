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
  {
    categorySlug: "sniadania",
    title: "Puszyste Nalesniki z Borowkami",
    description: "Klasyczne, puszyste nalesniki podawane ze swiezymi owocami i syropem klonowym.",
    ingredients: [["maka pszenna", 150, "g"], ["mleko", 200, "ml"], ["jajko", 1, "szt"], ["proszek do pieczenia", 1, "lyzeczka"], ["borowki", 100, "g"], ["syrop klonowy", 30, "ml"]],
    steps: ["Wymieszaj make, proszek do pieczenia, mleko i jajko na gladka mase.", "Smaz nalesniki na rozgrzanej, lekko natluszczonej patelni z obu stron na zloty kolor.", "Podawaj z borowkami i obficie polej syropem klonowym."],
    tags: ["sniadanie", "na-slodko", "nalesniki"],
    diets: ["vegetarian"],
    prepTimeMinutes: 10,
    cookTimeMinutes: 10,
    servings: 2,
    difficulty: "easy",
    nutrition: { calories: 380, protein: 12, fat: 8, carbs: 62 },
    ratingAvg: 4.9,
    ratingCount: 42,
    favoriteCount: 78,
  },
  {
    categorySlug: "obiady",
    title: "Tradycyjne Pierogi Ruskie",
    description: "Domowe pierogi z farszem z ziemniakow i twarogu, podawane ze zlocista cebulka.",
    ingredients: [["maka pszenna", 400, "g"], ["ciepla woda", 200, "ml"], ["ziemniaki", 500, "g"], ["twarog poltlusty", 250, "g"], ["cebula", 2, "szt"], ["maslo", 50, "g"]],
    steps: ["Ugotuj ziemniaki, a nastepnie przecisnij je przez praske razem z twarogiem.", "Podsmaz drobno pokrojona cebule i dodaj do farszu, dopraw sola i duza iloscia pieprzu.", "Zagnieć ciasto z maki i cieplej wody, rozwalkuj cienko i wycinaj krazki.", "Nakladaj farsz, zlepiaj brzegi i gotuj w osolonej wodzie przez 3 minuty od wyplyniecia.", "Podawaj okraszone maslem ze smazona cebulka."],
    tags: ["obiad", "pierogi", "klasyk", "polskie"],
    diets: ["vegetarian"],
    prepTimeMinutes: 40,
    cookTimeMinutes: 20,
    servings: 4,
    difficulty: "hard",
    nutrition: { calories: 540, protein: 16, fat: 15, carbs: 85 },
    ratingAvg: 4.8,
    ratingCount: 56,
    favoriteCount: 92,
  },
  {
    categorySlug: "obiady",
    title: "Pieczony Losos z Cytryna i Koperkiem",
    description: "Delikatny filet z lososia pieczony z maslem czosnkowym, cytryna i koperkiem.",
    ingredients: [["filet z lososia", 400, "g"], ["cytryna", 1, "szt"], ["maslo", 30, "g"], ["czosnek", 2, "zabki"], ["swiezy koperek", 1, "peczek"]],
    steps: ["Oczysc filet z lososia i uloz w naczyniu zaroodpornym.", "Roztop maslo, wymieszaj z przeciśnietym czosnkiem i posiekanym koperkiem, posmaruj lososia.", "Uloz na wierzchu plasterki cytryny.", "Piecz w piekarniku nagrzanym do 180 stopni przez okolo 15-18 minut."],
    tags: ["obiad", "ryba", "fit", "szybkie"],
    diets: ["high-protein", "low-carb"],
    prepTimeMinutes: 10,
    cookTimeMinutes: 18,
    servings: 2,
    difficulty: "easy",
    nutrition: { calories: 340, protein: 32, fat: 22, carbs: 3 },
    ratingAvg: 4.7,
    ratingCount: 28,
    favoriteCount: 45,
  },
  {
    categorySlug: "wegetarianskie",
    title: "Kremowa Zupa Pomidorowa z Bazylia",
    description: "Aromatyczna, kremowa zupa ze slodkich pomidorow pelati ze swieza bazylia i grzankami.",
    ingredients: [["pomidory pelati w puszce", 800, "g"], ["bulion warzywny", 500, "ml"], ["cebula", 1, "szt"], ["czosnek", 2, "zabki"], ["smietanka 30%", 100, "ml"], ["swieza bazylia", 1, "garsc"]],
    steps: ["Podsmaz posiekana cebule i czosnek w garnku na oliwie.", "Dodaj pomidory pelati oraz bulion warzywny, gotuj na wolnym ogniu przez 15 minut.", "Zblenduj zupe na gladki krem razem z listkami swiezej bazylii.", "Zabiel smietanka, dopraw sola, pieprzem i odrobina cukru do smaku. Podawaj z grzankami."],
    tags: ["zupa", "pomidorowa", "bazylia", "krem"],
    diets: ["vegetarian"],
    prepTimeMinutes: 10,
    cookTimeMinutes: 15,
    servings: 3,
    difficulty: "easy",
    nutrition: { calories: 240, protein: 5, fat: 16, carbs: 18 },
    ratingAvg: 4.6,
    ratingCount: 33,
    favoriteCount: 50,
  },
  {
    categorySlug: "desery",
    title: "Czekoladowy Lawa Cake",
    description: "Ekskluzywny deser czekoladowy z plynnym wnetrzem, idealny na specjalne okazje.",
    ingredients: [["gorzka czekolada", 100, "g"], ["maslo", 50, "g"], ["jajka", 2, "szt"], ["cukier", 30, "g"], ["maka pszenna", 20, "g"]],
    steps: ["Roztop gorzka czekolade z maslem w kapieli wodnej i odstaw do lekkiego przestudzenia.", "Ubij jajka z cukrem na puszysta mase.", "Polacz mase jajeczna z czekolada, delikatnie mieszajac, a na koniec dodaj make.", "Przelej do natluszczonych i wysypanych kakao kokilek.", "Piecz w piekarniku rozgrzanym do 200 stopni przez dokladnie 8-9 minut, aby srodek pozostal plynny.", "Podawaj na cieplo, opcjonalnie z lodami waniliowymi."],
    tags: ["deser", "czekolada", "lawa-cake", "wytworne"],
    diets: ["vegetarian"],
    prepTimeMinutes: 15,
    cookTimeMinutes: 9,
    servings: 2,
    difficulty: "medium",
    nutrition: { calories: 410, protein: 7, fat: 28, carbs: 32 },
    ratingAvg: 4.9,
    ratingCount: 65,
    favoriteCount: 110,
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
