/**
 * Skrypt inicjalizujacy (seed) baze danych.
 * Strategia:
 * 1. Tworzy kategorie, jesli nie istnieja (upsert).
 * 2. Tworzy konto administratora demonstracyjnego.
 * 3. Generuje szeroki zestaw przepisow na podstawie zdefiniowanych szablonow i wariantow,
 *    aby wypelnic baze realistycznymi danymi testowymi.
 */
const { connectDb } = require("./db");
const { hashPassword, makeSlug, normalizeText, now } = require("./utils");
const crypto = require("crypto");

// Definicja podstawowych kategorii dan
const categories = [
  { name: "Sniadania", slug: "sniadania", description: "Energetyczny start dnia", order: 10, isActive: true },
  { name: "Obiady", slug: "obiady", description: "Dania glowne na co dzien", order: 20, isActive: true },
  { name: "Desery", slug: "desery", description: "Slodkie przepisy i wypieki", order: 30, isActive: true },
  { name: "Wegetarianskie", slug: "wegetarianskie", description: "Bez miesa, pelne smaku", order: 40, isActive: true },
  { name: "Zupy", slug: "zupy", description: "Kremy, buliony i sycace zupy", order: 50, isActive: true },
  { name: "Salatki", slug: "salatki", description: "Lekkie miski i salatki na kazda pore", order: 60, isActive: true },
  { name: "Kolacje", slug: "kolacje", description: "Szybkie dania na wieczor", order: 70, isActive: true },
  { name: "Przekaski", slug: "przekaski", description: "Male porcje, pasty i dodatki", order: 80, isActive: true },
];

const images = {
  sniadania: "https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=1200&q=80",
  obiady: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=1200&q=80",
  desery: "https://images.unsplash.com/photo-1488477181946-6428a0291777?auto=format&fit=crop&w=1200&q=80",
  wegetarianskie: "https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=1200&q=80",
  zupy: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=1200&q=80",
  salatki: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?auto=format&fit=crop&w=1200&q=80",
  kolacje: "https://images.unsplash.com/photo-1559847844-5315695dadae?auto=format&fit=crop&w=1200&q=80",
  przekaski: "https://images.unsplash.com/photo-1541014741259-de529411b96a?auto=format&fit=crop&w=1200&q=80",
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

const recipeTemplates = [
  { categorySlug: "sniadania", base: "Jajecznica", main: "jajka", unit: "szt", tags: ["sniadanie", "bialko"], diets: ["high-protein"], image: "sniadania" },
  { categorySlug: "sniadania", base: "Owsianka", main: "platki owsiane", unit: "g", tags: ["owsianka", "szybkie"], diets: ["vegetarian"], image: "sniadania" },
  { categorySlug: "sniadania", base: "Tosty", main: "chleb pelnoziarnisty", unit: "g", tags: ["tosty", "sniadanie"], diets: ["vegetarian"], image: "sniadania" },
  { categorySlug: "obiady", base: "Kurczak", main: "piers z kurczaka", unit: "g", tags: ["kurczak", "obiad"], diets: ["high-protein"], image: "obiady" },
  { categorySlug: "obiady", base: "Makaron", main: "makaron", unit: "g", tags: ["makaron", "obiad"], diets: ["family"], image: "obiady" },
  { categorySlug: "obiady", base: "Ryba", main: "filet z dorsza", unit: "g", tags: ["ryba", "fit"], diets: ["high-protein"], image: "obiady" },
  { categorySlug: "wegetarianskie", base: "Curry warzywne", main: "ciecierzyca", unit: "g", tags: ["curry", "wegetarianskie"], diets: ["vegetarian"], image: "wegetarianskie" },
  { categorySlug: "wegetarianskie", base: "Kasza z warzywami", main: "kasza gryczana", unit: "g", tags: ["kasza", "warzywa"], diets: ["vegetarian"], image: "wegetarianskie" },
  { categorySlug: "zupy", base: "Krem z warzyw", main: "marchew", unit: "g", tags: ["zupa", "krem"], diets: ["vegetarian"], image: "zupy" },
  { categorySlug: "zupy", base: "Rosol domowy", main: "udko z kurczaka", unit: "g", tags: ["zupa", "klasyk"], diets: ["family"], image: "zupy" },
  { categorySlug: "salatki", base: "Salatka", main: "mix salat", unit: "g", tags: ["salatka", "lekko"], diets: ["vegetarian"], image: "salatki" },
  { categorySlug: "salatki", base: "Bowl", main: "komosa ryzowa", unit: "g", tags: ["bowl", "fit"], diets: ["vegetarian"], image: "salatki" },
  { categorySlug: "kolacje", base: "Wrap", main: "tortilla", unit: "szt", tags: ["kolacja", "szybkie"], diets: ["family"], image: "kolacje" },
  { categorySlug: "kolacje", base: "Zapiekanka", main: "ziemniaki", unit: "g", tags: ["kolacja", "zapiekanka"], diets: ["family"], image: "kolacje" },
  { categorySlug: "przekaski", base: "Pasta kanapkowa", main: "twarog", unit: "g", tags: ["przekaska", "pasta"], diets: ["vegetarian"], image: "przekaski" },
  { categorySlug: "przekaski", base: "Hummus", main: "ciecierzyca", unit: "g", tags: ["hummus", "dip"], diets: ["vegetarian"], image: "przekaski" },
  { categorySlug: "desery", base: "Ciasto", main: "maka pszenna", unit: "g", tags: ["deser", "ciasto"], diets: ["vegetarian"], image: "desery" },
  { categorySlug: "desery", base: "Mus", main: "czekolada", unit: "g", tags: ["deser", "czekolada"], diets: ["vegetarian"], image: "desery" },
];

const variants = [
  "z pomidorami", "z bazylia", "z pieczarkami", "z papryka", "z cukinia", "z brokulami",
  "z feta", "z koperkiem", "z sosem jogurtowym", "z pesto", "z imbirem", "z orzechami",
  "z awokado", "z kukurydza", "z fasola", "z rukola", "z serem", "z curry",
  "z czosnkiem", "z suszonymi pomidorami", "z ryzem", "z kasza", "z cytryna", "z chili",
];

const sideIngredients = [
  ["cebula", 1, "szt"],
  ["czosnek", 2, "zabki"],
  ["oliwa", 2, "lyzki"],
  ["sol", 1, "szczypta"],
  ["pieprz", 1, "szczypta"],
  ["natka pietruszki", 1, "garsc"],
];

function generateRecipeCatalog(size = 216) {
  return Array.from({ length: size }, (_, index) => {
    const template = recipeTemplates[index % recipeTemplates.length];
    const variant = variants[Math.floor(index / recipeTemplates.length) % variants.length];
    const prepTimeMinutes = 5 + (index % 6) * 5;
    const cookTimeMinutes = template.categorySlug === "desery" ? 20 + (index % 5) * 5 : 10 + (index % 7) * 4;
    const servings = 1 + (index % 6);
    const calories = 220 + (index % 13) * 35;
    const protein = 8 + (index % 11) * 3;
    const fat = 6 + (index % 9) * 2;
    const carbs = 18 + (index % 12) * 5;
    const difficulty = index % 9 === 0 ? "hard" : index % 3 === 0 ? "medium" : "easy";
    const extra = sideIngredients[index % sideIngredients.length];

    return {
      categorySlug: template.categorySlug,
      title: `${template.base} ${variant}`,
      description: `Dokladnie opisany przepis na ${template.base.toLowerCase()} ${variant}. Zawiera przygotowanie skladnikow, sposob obrobki, doprawianie i podanie, aby danie wyszlo powtarzalnie nawet za pierwszym razem.`,
      ingredients: [
        [template.main, template.unit === "szt" ? 2 + (index % 4) : 120 + (index % 6) * 40, template.unit],
        extra,
        ["przyprawy", 1, "lyzeczka"],
        ["woda lub bulion", 150 + (index % 4) * 50, "ml"],
      ],
      steps: buildDetailedSteps(template, variant, prepTimeMinutes, cookTimeMinutes, servings),
      tags: [...template.tags, makeSlug(variant), difficulty],
      diets: template.diets,
      prepTimeMinutes,
      cookTimeMinutes,
      servings,
      difficulty,
      nutrition: { calories, protein, fat, carbs },
      ratingAvg: Math.round((3.8 + (index % 12) * 0.1) * 10) / 10,
      ratingCount: 5 + (index % 90),
      favoriteCount: 8 + (index % 130),
      imageKey: template.image,
    };
  });
}

function buildDetailedSteps(template, variant, prepTimeMinutes, cookTimeMinutes, servings) {
  const base = template.base.toLowerCase();
  const main = template.main;
  const commonStart = [
    `Odmierz skladniki na ${servings} porcje. ${main} przygotuj jako skladnik bazowy: umyj, osusz i pokroj albo rozdrobnij tak, aby kawalki byly podobnej wielkosci.`,
    `Przygotuj dodatki do wariantu "${variant}": posiekaj cebule lub ziola, odmierz przyprawy, a mokre skladniki trzymaj pod reka. Dzieki temu gotowanie pojdzie bez przerw.`,
  ];

  const finish = [
    "Na koniec sprobuj dania i dopraw sola, pieprzem oraz przyprawami. Jesli smak jest zbyt delikatny, dodaj odrobine kwasu, ziol albo ostrej przyprawy.",
    "Odstaw danie na 2 minuty, aby smaki sie polaczyly. Podawaj cieple, najlepiej z dodatkiem swiezych ziol albo chrupiacego pieczywa.",
  ];

  const byCategory = {
    sniadania: [
      `Rozgrzej patelnie lub rondelek na srednim ogniu. Dodaj skladnik bazowy i mieszaj regularnie, aby nic nie przywarlo ani sie nie przypalilo.`,
      `Gotuj lub smaz przez okolo ${Math.max(6, cookTimeMinutes)} minut. Masa powinna byc zwarta, ale nadal wilgotna; jezeli gestnieje za szybko, zmniejsz ogien.`,
    ],
    obiady: [
      `Rozgrzej szeroka patelnie albo garnek. Podsmaz skladniki aromatyczne przez 2-3 minuty, potem dodaj ${main} i obsmaz z kazdej strony.`,
      `Dodaj plyn lub sos i gotuj pod przykryciem przez okolo ${cookTimeMinutes} minut. Mieszaj co kilka minut, a gdy sos za bardzo gestnieje, dolej kilka lyzek wody.`,
    ],
    wegetarianskie: [
      `Rozgrzej oliwe w garnku lub na patelni. Dodaj warzywa i ${main}, po czym podsmazaj 5 minut, az skladniki lekko sie zarumienia.`,
      `Wlej wode, bulion albo sos i dus przez okolo ${cookTimeMinutes} minut. Danie jest gotowe, gdy warzywa sa miekkie, ale nie rozpadaja sie.`,
    ],
    zupy: [
      `W garnku podsmaz cebule, czosnek i przyprawy przez 2-3 minuty. Dodaj ${main}, zalej bulionem i zagotuj.`,
      `Gotuj na malym ogniu przez okolo ${cookTimeMinutes} minut. Jesli robisz krem, zblenduj zupe na gladko i dopiero wtedy dopraw do smaku.`,
    ],
    salatki: [
      `Ugotuj albo przygotuj ${main}, a nastepnie przestudz, zeby nie zwiadl delikatnych warzyw. Skladniki pokroj na podobne kawalki.`,
      `Wymieszaj dressing w osobnej miseczce, polej salatke tuz przed podaniem i delikatnie przemieszaj, aby kazdy skladnik byl pokryty sosem.`,
    ],
    kolacje: [
      `Rozgrzej piekarnik, patelnie albo opiekacz. Przygotuj ${main} i dodatki, a skladniki ukladaj warstwami, zeby kazdy kes mial podobny smak.`,
      `Podgrzewaj przez okolo ${cookTimeMinutes} minut, az wierzch bedzie lekko chrupiacy, a srodek goracy. Przed krojeniem odczekaj minute.`,
    ],
    przekaski: [
      `Rozgniec, zblenduj albo drobno posiekaj ${main}. Dodawaj plynne skladniki stopniowo, zeby kontrolowac gestosc przekaski.`,
      `Schlodz paste lub dip przez kilka minut. Jesli przekaska jest za gesta, dodaj lyzke jogurtu, oliwy albo wody i ponownie wymieszaj.`,
    ],
    desery: [
      `Rozgrzej piekarnik albo przygotuj naczynie do chlodzenia. Suche skladniki wymieszaj osobno, mokre osobno, a potem polacz je krotko, tylko do uzyskania jednolitej masy.`,
      `Piecz, chlodz albo podgrzewaj przez okolo ${cookTimeMinutes} minut. Deser jest gotowy, gdy wierzch sie zetnie, a srodek zachowa wlasciwa konsystencje.`,
    ],
  };

  return [
    ...commonStart,
    ...(byCategory[template.categorySlug] || byCategory.obiady),
    `Calkowity czas pracy to okolo ${prepTimeMinutes + cookTimeMinutes} minut. Kontroluj konsystencje: danie nie powinno byc suche ani wodniste.`,
    ...finish,
  ];
}

function expandRecipeSteps(item) {
  const hasDetailedSteps = item.steps.length >= 5 && item.steps.every((step) => step.length >= 70);
  if (hasDetailedSteps) return item.steps;

  const ingredients = item.ingredients
    .slice(0, 4)
    .map(([name, quantity, unit]) => `${name} (${quantity} ${unit})`)
    .join(", ");

  return [
    `Przygotuj stanowisko i odmierz skladniki: ${ingredients}. Produkty umyj, osusz i pokroj przed rozpoczeciem gotowania, zeby kolejne etapy wykonac bez pospiechu.`,
    ...item.steps.map((step, index) => {
      const hint = index === 0
        ? "Utrzymuj srednia temperature i mieszaj, aby skladniki rownomiernie sie ogrzewaly."
        : "Kontroluj konsystencje oraz zapach; jezeli skladniki zaczynaja przywierac, zmniejsz ogien albo dodaj odrobine wody.";
      return `${step} ${hint}`;
    }),
    `Po wykonaniu glownych etapow sprobuj dania i dopraw je sola, pieprzem albo ziolami. Jesli smak jest za lagodny, dodaj odrobine kwasu, ostrej przyprawy lub tluszczu.`,
    "Przed podaniem odstaw danie na 2 minuty. Nastepnie przeloz na talerze, dodaj swieze ziola lub wybrany dodatek i podawaj od razu, gdy ma najlepsza temperature.",
  ];
}

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

  const allRecipes = [...recipes, ...generateRecipeCatalog(216)];
  await db.collection("recipes").deleteMany({
    authorId: user._id,
    title: { $regex: "\\s\\d{3}$" },
  });

  for (const item of allRecipes) {
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
      steps: expandRecipeSteps(item).map((instruction, index) => ({ order: index + 1, instruction, durationMinutes: index === 0 ? 8 : 5 })),
      tags: item.tags.map(makeSlug),
      diets: item.diets.map(makeSlug),
      images: [{ url: images[item.imageKey || item.categorySlug], alt: item.title, isMain: true }],
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
      seedSource: "cookflow-demo",
      createdAt,
      updatedAt: createdAt,
    };
    const { createdAt: insertCreatedAt, ...updateDocument } = document;
    await db.collection("recipes").updateOne(
      { slug: document.slug },
      { $set: updateDocument, $setOnInsert: { createdAt: insertCreatedAt } },
      { upsert: true },
    );
    for (const slug of document.tags) {
      await db.collection("tags").updateOne(
        { slug },
        { $setOnInsert: { name: slug.replace(/-/g, " "), slug }, $inc: { usageCount: 1 } },
        { upsert: true },
      );
    }
  }

  console.log(`Seed zakonczony. Przepisy w seedzie: ${allRecipes.length}. Demo login: admin@example.com`);
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
