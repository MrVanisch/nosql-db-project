# Aplikacja NoSQL do przepisow internetowych

Projekt z przedmiotu Zaawansowane Bazy Danych. System sluzy do publikowania, wyszukiwania, oceniania i zapisywania przepisow kulinarnych.

## Zakres dokumentacji

- [Przypadki uzycia](docs/use-cases.md)
- [Model ERD](docs/erd.md)
- [Kolekcje MongoDB, walidacja i indeksy](docs/collections.md)
- [Endpointy API](docs/endpoints.md)

## Wybrana baza danych

Projekt zaklada uzycie MongoDB. Dane przepisow maja naturalna strukture dokumentowa: skladniki, kroki przygotowania, tagi, wartosci odzywcze i multimedia sa czescia jednego przepisu. Model wykorzystuje denormalizacje dla szybkiego wyswietlania list oraz osobne kolekcje dla danych szybko rosnacych, takich jak komentarze, oceny i aktywnosc uzytkownikow.

## Glowne encje

- Uzytkownik
- Przepis
- Kategoria
- Tag
- Komentarz
- Ocena
- Lista zakupow
- Ulubione / zapisane przepisy
- Plan posilkow

## Glowne wymagania funkcjonalne

- Rejestracja i logowanie uzytkownika.
- Dodawanie, edycja i usuwanie wlasnych przepisow.
- Wyszukiwanie przepisow po nazwie, skladnikach, tagach, kategorii, czasie przygotowania i diecie.
- Wyswietlanie szczegolow przepisu.
- Ocenianie i komentowanie przepisow.
- Zapisywanie przepisow do ulubionych.
- Generowanie listy zakupow z przepisu.
- Planowanie posilkow w kalendarzu.

## Wymagania niefunkcjonalne

- Szybkie wyszukiwanie po tekstach, tagach i skladnikach.
- Mozliwosc skalowania liczby komentarzy i ocen niezaleznie od przepisow.
- Zachowanie historii dat utworzenia i aktualizacji.
- Walidacja struktury dokumentow po stronie bazy.
- Indeksy dopasowane do najczestszych zapytan aplikacji.

## Uruchomienie aplikacji

Aplikacja jest wykonana jako Node.js + Express + MongoDB Atlas + statyczny frontend.

1. Zainstaluj zaleznosci:

```bash
npm install
```

2. Skopiuj `.env.example` do `.env` i ustaw `MONGODB_URI`, `MONGODB_DB_NAME` oraz `JWT_SECRET`.

Haslo w URI musi byc zakodowane URL-owo, dlatego poprawny format dla klastra Atlas to:

```env
MONGODB_URI=mongodb+srv://<db_user>:<url_encoded_password>@cluster.example.mongodb.net/?retryWrites=true&w=majority&authSource=admin&appName=recipes-app
MONGODB_DB_NAME=recipes_app
```

3. Wgraj dane demonstracyjne i indeksy:

```bash
npm run seed
```

4. Sprawdz polaczenie z baza:

```bash
npm run db:check
```

5. Uruchom aplikacje:

```bash
npm run dev
```

Adres lokalny: `http://localhost:3000`

Konto demonstracyjne po seedzie ma e-mail `admin@example.com`.
Haslo ustaw lokalnie przez `DEMO_ADMIN_PASSWORD` albo odczytaj wygenerowana wartosc z konsoli podczas pierwszego seedowania.

## Zabezpieczenia i wydajnosc

- Hasla sa hashowane przez `bcryptjs`.
- Sesja uzywa tokenow JWT.
- API ma `helmet`, `rate-limit`, `cors`, limit JSON i walidacje `zod`.
- MongoDB dostaje indeksy opisane w dokumentacji: tekstowe wyszukiwanie przepisow, unikalne konta, unikalne oceny i ulubione, indeksy po uzytkowniku, dacie, tagach, diecie i skladnikach.
- Frontend dziala jako szybka aplikacja bez przeladowywania strony.

## MongoDB Atlas Network Access

Jezeli `npm run seed` albo `npm run db:check` zwraca blad `tlsv1 alert internal error`, polaczenie TCP do Atlas dziala, ale klaster odrzuca handshake TLS przed logowaniem. W Atlas dodaj publiczny adres IP komputera w `Security -> Network Access`.
