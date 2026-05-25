# Endpointy API

Proponowany styl API: REST + JSON. Wszystkie endpointy zwracaja JSON. Endpointy oznaczone jako `Auth` wymagaja tokenu JWT.

## Autoryzacja

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| POST | `/api/auth/register` | Nie | Rejestracja uzytkownika |
| POST | `/api/auth/login` | Nie | Logowanie |
| POST | `/api/auth/refresh` | Tak | Odnowienie tokenu |
| POST | `/api/auth/logout` | Tak | Wylogowanie |

### POST `/api/auth/register`

```json
{
  "username": "anna_kuchnia",
  "email": "anna@example.com",
  "password": "SilneHaslo123!"
}
```

## Uzytkownicy

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| GET | `/api/users/me` | Tak | Profil zalogowanego uzytkownika |
| PATCH | `/api/users/me` | Tak | Edycja profilu |
| GET | `/api/users/{username}` | Nie | Publiczny profil autora |
| GET | `/api/users/{username}/recipes` | Nie | Przepisy autora |

## Przepisy

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| GET | `/api/recipes` | Nie | Lista i wyszukiwarka przepisow |
| POST | `/api/recipes` | Tak | Dodanie przepisu |
| GET | `/api/recipes/{slug}` | Nie | Szczegoly przepisu |
| PATCH | `/api/recipes/{id}` | Tak | Edycja wlasnego przepisu |
| DELETE | `/api/recipes/{id}` | Tak | Usuniecie lub ukrycie wlasnego przepisu |

### GET `/api/recipes`

Parametry zapytania:

| Parametr | Przyklad | Opis |
|---|---|---|
| `q` | `makaron kurczak` | Wyszukiwanie tekstowe |
| `category` | `obiady` | Slug kategorii |
| `tags` | `szybki-obiad,makaron` | Lista tagow |
| `ingredients` | `kurczak,szpinak` | Wymagane skladniki |
| `diet` | `vegetarian` | Dieta |
| `difficulty` | `easy` | Poziom trudnosci |
| `maxTime` | `30` | Maksymalny czas w minutach |
| `minRating` | `4` | Minimalna srednia ocena |
| `sort` | `rating` | `rating`, `newest`, `popular`, `time` |
| `page` | `1` | Numer strony |
| `limit` | `20` | Liczba wynikow |

Przyklad:

```http
GET /api/recipes?q=makaron&ingredients=kurczak,szpinak&maxTime=30&sort=rating&page=1&limit=20
```

### POST `/api/recipes`

```json
{
  "title": "Makaron z kurczakiem i szpinakiem",
  "description": "Szybki obiad w kremowym sosie.",
  "categoryId": "665000000000000000000001",
  "ingredients": [
    {
      "name": "makaron penne",
      "quantity": 250,
      "unit": "g"
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
  "prepTimeMinutes": 10,
  "cookTimeMinutes": 20,
  "servings": 2,
  "difficulty": "easy"
}
```

## Kategorie i tagi

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| GET | `/api/categories` | Nie | Lista kategorii |
| POST | `/api/categories` | Admin | Dodanie kategorii |
| PATCH | `/api/categories/{id}` | Admin | Edycja kategorii |
| GET | `/api/tags` | Nie | Lista popularnych tagow |
| POST | `/api/tags` | Admin | Dodanie tagu |

## Komentarze

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| GET | `/api/recipes/{recipeId}/comments` | Nie | Komentarze przepisu z paginacja |
| POST | `/api/recipes/{recipeId}/comments` | Tak | Dodanie komentarza |
| PATCH | `/api/comments/{id}` | Tak | Edycja wlasnego komentarza |
| DELETE | `/api/comments/{id}` | Tak | Usuniecie wlasnego komentarza |
| PATCH | `/api/admin/comments/{id}/status` | Admin | Moderacja komentarza |

## Oceny

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| PUT | `/api/recipes/{recipeId}/rating` | Tak | Dodanie lub zmiana oceny |
| DELETE | `/api/recipes/{recipeId}/rating` | Tak | Usuniecie oceny |
| GET | `/api/recipes/{recipeId}/rating/me` | Tak | Ocena zalogowanego uzytkownika |

### PUT `/api/recipes/{recipeId}/rating`

```json
{
  "value": 5
}
```

## Ulubione

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| GET | `/api/me/favorites` | Tak | Lista zapisanych przepisow |
| POST | `/api/me/favorites/{recipeId}` | Tak | Dodanie do ulubionych |
| DELETE | `/api/me/favorites/{recipeId}` | Tak | Usuniecie z ulubionych |

## Listy zakupow

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| GET | `/api/me/shopping-lists` | Tak | Listy zakupow uzytkownika |
| POST | `/api/me/shopping-lists` | Tak | Utworzenie listy recznie |
| POST | `/api/recipes/{recipeId}/shopping-list` | Tak | Wygenerowanie listy z przepisu |
| PATCH | `/api/me/shopping-lists/{id}` | Tak | Edycja listy |
| DELETE | `/api/me/shopping-lists/{id}` | Tak | Usuniecie listy |

## Plan posilkow

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| GET | `/api/me/meal-plans?from=2026-05-18&to=2026-05-24` | Tak | Plan posilkow w zakresie dat |
| POST | `/api/me/meal-plans` | Tak | Dodanie przepisu do planu |
| PATCH | `/api/me/meal-plans/{id}` | Tak | Edycja wpisu |
| DELETE | `/api/me/meal-plans/{id}` | Tak | Usuniecie wpisu |

### POST `/api/me/meal-plans`

```json
{
  "recipeId": "665000000000000000000010",
  "plannedFor": "2026-05-20",
  "mealType": "dinner",
  "servings": 2
}
```

## Administracja

| Metoda | Endpoint | Auth | Opis |
|---|---|---:|---|
| GET | `/api/admin/reports` | Admin | Lista zgloszen |
| POST | `/api/recipes/{recipeId}/reports` | Tak | Zgloszenie przepisu |
| PATCH | `/api/admin/recipes/{id}/status` | Admin | Ukrycie lub publikacja przepisu |

## Standard odpowiedzi bledu

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Niepoprawne dane wejsciowe",
    "details": [
      {
        "field": "ingredients",
        "message": "Przepis musi miec co najmniej jeden skladnik"
      }
    ]
  }
}
```
