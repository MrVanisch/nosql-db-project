# Kolekcje NoSQL

Projekt zaklada uzycie MongoDB. Model jest oparty o dokumenty, dlatego dane, ktore sa zawsze wyswietlane razem z przepisem, zostaja zagniezdzone w kolekcji `recipes`. Dane szybko rosnace albo zalezne od aktywnosci uzytkownikow sa w osobnych kolekcjach.

## `users`

Kolekcja przechowuje konta uzytkownikow.

```json
{
  "_id": "ObjectId",
  "username": "anna_kuchnia",
  "email": "anna@example.com",
  "passwordHash": "hash_hasla",
  "role": "user",
  "profile": {
    "displayName": "Anna Kowalska",
    "bio": "Szybkie obiady i domowe desery",
    "avatarUrl": "https://example.com/avatar.jpg"
  },
  "createdAt": "2026-05-18T12:00:00Z",
  "updatedAt": "2026-05-18T12:00:00Z"
}
```

**Indeksy:**

```javascript
db.users.createIndex({ email: 1 }, { unique: true })
db.users.createIndex({ username: 1 }, { unique: true })
```

## `recipes`

Glowna kolekcja systemu. Jest zoptymalizowana pod szybkie wyswietlanie szczegolow przepisu oraz list wynikow wyszukiwania.

```json
{
  "_id": "ObjectId",
  "authorId": "ObjectId",
  "authorSnapshot": {
    "username": "anna_kuchnia",
    "displayName": "Anna Kowalska",
    "avatarUrl": "https://example.com/avatar.jpg"
  },
  "categoryId": "ObjectId",
  "categorySlug": "obiady",
  "title": "Makaron z kurczakiem i szpinakiem",
  "slug": "makaron-z-kurczakiem-i-szpinakiem",
  "description": "Szybki obiad w kremowym sosie.",
  "ingredients": [
    {
      "name": "makaron penne",
      "normalizedName": "makaron",
      "quantity": 250,
      "unit": "g",
      "note": ""
    }
  ],
  "steps": [
    {
      "order": 1,
      "instruction": "Ugotuj makaron al dente.",
      "durationMinutes": 10
    }
  ],
  "tags": ["makaron", "szybki-obiad"],
  "diets": ["high-protein"],
  "images": [
    {
      "url": "https://example.com/makaron.jpg",
      "alt": "Makaron z kurczakiem i szpinakiem",
      "isMain": true
    }
  ],
  "nutrition": {
    "calories": 620,
    "protein": 38,
    "fat": 22,
    "carbs": 68
  },
  "prepTimeMinutes": 10,
  "cookTimeMinutes": 20,
  "totalTimeMinutes": 30,
  "servings": 2,
  "difficulty": "easy",
  "status": "published",
  "ratingAvg": 4.7,
  "ratingCount": 31,
  "commentCount": 8,
  "favoriteCount": 54,
  "createdAt": "2026-05-18T12:00:00Z",
  "updatedAt": "2026-05-18T12:00:00Z"
}
```

**Indeksy:**

```javascript
db.recipes.createIndex({ slug: 1 }, { unique: true })
db.recipes.createIndex({ authorId: 1, createdAt: -1 })
db.recipes.createIndex({ categorySlug: 1, ratingAvg: -1 })
db.recipes.createIndex({ tags: 1, ratingAvg: -1 })
db.recipes.createIndex({ diets: 1, totalTimeMinutes: 1 })
db.recipes.createIndex({ "ingredients.normalizedName": 1 })
db.recipes.createIndex({ status: 1, createdAt: -1 })
db.recipes.createIndex({
  title: "text",
  description: "text",
  tags: "text",
  "ingredients.normalizedName": "text"
})
```

**Dlaczego tak:**

- Skladniki i kroki sa w przepisie, bo zawsze sa potrzebne przy wyswietlaniu przepisu.
- `authorSnapshot` pozwala pokazac autora bez dodatkowego zapytania do `users`.
- Pola `ratingAvg`, `ratingCount`, `commentCount` i `favoriteCount` przyspieszaja sortowanie i listy.

## `categories`

```json
{
  "_id": "ObjectId",
  "name": "Obiady",
  "slug": "obiady",
  "description": "Dania glowne na co dzien",
  "order": 10,
  "isActive": true
}
```

**Indeksy:**

```javascript
db.categories.createIndex({ slug: 1 }, { unique: true })
db.categories.createIndex({ isActive: 1, order: 1 })
```

## `tags`

```json
{
  "_id": "ObjectId",
  "name": "Szybki obiad",
  "slug": "szybki-obiad",
  "usageCount": 214
}
```

**Indeksy:**

```javascript
db.tags.createIndex({ slug: 1 }, { unique: true })
db.tags.createIndex({ usageCount: -1 })
```

## `comments`

Komentarze sa osobna kolekcja, bo ich liczba moze rosnac bez ograniczen.

```json
{
  "_id": "ObjectId",
  "recipeId": "ObjectId",
  "userId": "ObjectId",
  "userSnapshot": {
    "username": "marek88",
    "displayName": "Marek"
  },
  "body": "Bardzo dobry przepis.",
  "status": "visible",
  "createdAt": "2026-05-18T12:00:00Z",
  "updatedAt": "2026-05-18T12:00:00Z"
}
```

**Indeksy:**

```javascript
db.comments.createIndex({ recipeId: 1, createdAt: -1 })
db.comments.createIndex({ userId: 1, createdAt: -1 })
db.comments.createIndex({ status: 1 })
```

## `ratings`

Oceny sa osobna kolekcja, zeby jeden uzytkownik mogl miec tylko jedna ocene dla danego przepisu.

```json
{
  "_id": "ObjectId",
  "recipeId": "ObjectId",
  "userId": "ObjectId",
  "value": 5,
  "createdAt": "2026-05-18T12:00:00Z",
  "updatedAt": "2026-05-18T12:00:00Z"
}
```

**Indeksy:**

```javascript
db.ratings.createIndex({ recipeId: 1, userId: 1 }, { unique: true })
db.ratings.createIndex({ recipeId: 1 })
```

## `favorites`

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "recipeId": "ObjectId",
  "recipeSnapshot": {
    "title": "Makaron z kurczakiem i szpinakiem",
    "slug": "makaron-z-kurczakiem-i-szpinakiem",
    "mainImageUrl": "https://example.com/makaron.jpg",
    "ratingAvg": 4.7,
    "totalTimeMinutes": 30
  },
  "createdAt": "2026-05-18T12:00:00Z"
}
```

**Indeksy:**

```javascript
db.favorites.createIndex({ userId: 1, createdAt: -1 })
db.favorites.createIndex({ userId: 1, recipeId: 1 }, { unique: true })
```

## `shoppingLists`

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "name": "Zakupy na obiad",
  "sourceRecipeId": "ObjectId",
  "servings": 4,
  "items": [
    {
      "name": "makaron penne",
      "quantity": 500,
      "unit": "g",
      "checked": false
    }
  ],
  "createdAt": "2026-05-18T12:00:00Z",
  "updatedAt": "2026-05-18T12:00:00Z"
}
```

**Indeksy:**

```javascript
db.shoppingLists.createIndex({ userId: 1, updatedAt: -1 })
```

## `mealPlans`

```json
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "recipeId": "ObjectId",
  "plannedFor": "2026-05-20",
  "mealType": "dinner",
  "servings": 2,
  "createdAt": "2026-05-18T12:00:00Z"
}
```

**Indeksy:**

```javascript
db.mealPlans.createIndex({ userId: 1, plannedFor: 1 })
db.mealPlans.createIndex({ userId: 1, plannedFor: 1, mealType: 1 })
```

## Optymalizacja modelu

- Dane przepisu sa w jednym dokumencie, poniewaz odczyt przepisu jest najczestsza operacja.
- Komentarze, oceny i ulubione sa oddzielone, bo ich liczba rosnie wraz z aktywnoscia uzytkownikow.
- Wyszukiwanie po tytule, opisie, tagach i skladnikach obsluguje indeks tekstowy.
- Najczestsze sortowania korzystaja z gotowych pol agregowanych, zamiast liczyc wartosci przy kazdym zapytaniu.
