# Model ERD

Model ERD pokazuje relacje logiczne. W MongoDB nie wszystkie relacje sa fizycznymi joinami; czesc danych jest zagniezdzona w dokumencie przepisu dla szybszego odczytu.

```mermaid
erDiagram
    USER ||--o{ RECIPE : creates
    USER ||--o{ COMMENT : writes
    USER ||--o{ RATING : gives
    USER ||--o{ FAVORITE : saves
    USER ||--o{ SHOPPING_LIST : owns
    USER ||--o{ MEAL_PLAN : plans

    CATEGORY ||--o{ RECIPE : groups
    RECIPE ||--o{ COMMENT : has
    RECIPE ||--o{ RATING : receives
    RECIPE ||--o{ FAVORITE : saved_as
    RECIPE ||--o{ MEAL_PLAN : scheduled_as
    RECIPE }o--o{ TAG : described_by
    RECIPE ||--o{ INGREDIENT : contains
    RECIPE ||--o{ PREPARATION_STEP : contains

    USER {
        ObjectId _id PK
        string username
        string email
        string passwordHash
        string role
        object profile
        date createdAt
        date updatedAt
    }

    RECIPE {
        ObjectId _id PK
        ObjectId authorId FK
        ObjectId categoryId FK
        string title
        string slug
        string description
        array ingredients
        array steps
        array tags
        array diets
        int prepTimeMinutes
        int cookTimeMinutes
        int servings
        string difficulty
        double ratingAvg
        int ratingCount
        int commentCount
        date createdAt
        date updatedAt
    }

    CATEGORY {
        ObjectId _id PK
        string name
        string slug
        string description
    }

    TAG {
        ObjectId _id PK
        string name
        string slug
    }

    INGREDIENT {
        string name
        decimal quantity
        string unit
        string note
    }

    PREPARATION_STEP {
        int order
        string instruction
        int durationMinutes
    }

    COMMENT {
        ObjectId _id PK
        ObjectId recipeId FK
        ObjectId userId FK
        string body
        string status
        date createdAt
    }

    RATING {
        ObjectId _id PK
        ObjectId recipeId FK
        ObjectId userId FK
        int value
        date createdAt
        date updatedAt
    }

    FAVORITE {
        ObjectId _id PK
        ObjectId recipeId FK
        ObjectId userId FK
        date createdAt
    }

    SHOPPING_LIST {
        ObjectId _id PK
        ObjectId userId FK
        string name
        array items
        date createdAt
        date updatedAt
    }

    MEAL_PLAN {
        ObjectId _id PK
        ObjectId userId FK
        ObjectId recipeId FK
        date plannedFor
        string mealType
        int servings
    }
```

## Decyzje modelowania NoSQL

- `ingredients`, `steps`, `nutrition`, `images`, `tags` i dane autora do listingu sa zagniezdzone w `recipes`, poniewaz sa zawsze potrzebne przy wyswietlaniu przepisu.
- `comments` sa osobna kolekcja, bo moga rosnac bez ograniczen i wymagaja paginacji.
- `ratings` sa osobna kolekcja, zeby wymusic jedna ocene uzytkownika dla przepisu i pozwolic na aktualizacje oceny.
- W `recipes` przechowywane sa pola agregowane `ratingAvg`, `ratingCount`, `commentCount`, `favoriteCount`, co przyspiesza listy i sortowanie.
- `favorites`, `shoppingLists` i `mealPlans` sa osobnymi kolekcjami, poniewaz sa powiazane z aktywnoscia konkretnego uzytkownika.
