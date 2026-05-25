# Przypadki uzycia

## Aktorzy

- Gosc: osoba niezalogowana, moze przegladac i wyszukiwac przepisy.
- Uzytkownik: osoba zalogowana, moze tworzyc przepisy, komentowac, oceniac i zapisywac przepisy.
- Administrator: zarzadza trescia, kategoriami, tagami i moderacja.

## UC-01 Rejestracja uzytkownika

**Aktor:** Gosc  
**Cel:** zalozenie konta w aplikacji.

**Scenariusz glowny:**
1. Gosc podaje nazwe, e-mail i haslo.
2. System sprawdza unikalnosc e-maila i nazwy uzytkownika.
3. System zapisuje konto z rola `user`.
4. System zwraca dane profilu i token sesji.

**Wyjatki:**
- E-mail jest juz zajety.
- Haslo nie spelnia wymagan.

## UC-02 Logowanie

**Aktor:** Gosc  
**Cel:** uzyskanie dostepu do funkcji uzytkownika.

**Scenariusz glowny:**
1. Gosc podaje e-mail i haslo.
2. System weryfikuje dane.
3. System zwraca token dostepu.

## UC-03 Dodanie przepisu

**Aktor:** Uzytkownik  
**Cel:** opublikowanie nowego przepisu.

**Scenariusz glowny:**
1. Uzytkownik podaje tytul, opis, skladniki, kroki, czas przygotowania, porcje, kategorie, tagi i zdjecia.
2. System waliduje wymagane pola.
3. System zapisuje dokument w kolekcji `recipes`.
4. System aktualizuje licznik przepisow autora.

**Wyjatki:**
- Brak co najmniej jednego skladnika.
- Brak co najmniej jednego kroku przygotowania.
- Niepoprawna kategoria.

## UC-04 Wyszukiwanie przepisow

**Aktor:** Gosc lub Uzytkownik  
**Cel:** znalezienie przepisow pasujacych do kryteriow.

**Scenariusz glowny:**
1. Aktor wpisuje fraze lub wybiera filtry.
2. System wykonuje zapytanie tekstowe i filtrujace.
3. System sortuje wyniki wedlug trafnosci, oceny, popularnosci albo daty.
4. System zwraca liste skroconych danych przepisow.

**Typowe filtry:**
- skladniki,
- tagi,
- kategoria,
- dieta,
- czas przygotowania,
- poziom trudnosci,
- minimalna ocena.

## UC-05 Wyswietlenie szczegolow przepisu

**Aktor:** Gosc lub Uzytkownik  
**Cel:** zobaczenie pelnego przepisu.

**Scenariusz glowny:**
1. Aktor otwiera przepis.
2. System pobiera dokument z `recipes`.
3. System pobiera ostatnie komentarze z `comments`.
4. System zwraca przepis z ocenami, autorem i metadanymi.

## UC-06 Ocena przepisu

**Aktor:** Uzytkownik  
**Cel:** wystawienie oceny od 1 do 5.

**Scenariusz glowny:**
1. Uzytkownik wybiera ocene.
2. System sprawdza, czy uzytkownik juz ocenial ten przepis.
3. System zapisuje lub aktualizuje dokument w `ratings`.
4. System przelicza `ratingAvg` i `ratingCount` w `recipes`.

## UC-07 Dodanie komentarza

**Aktor:** Uzytkownik  
**Cel:** dodanie opinii lub pytania pod przepisem.

**Scenariusz glowny:**
1. Uzytkownik wpisuje tresc komentarza.
2. System zapisuje komentarz w `comments`.
3. System zwieksza `commentCount` w `recipes`.

## UC-08 Zapisanie przepisu do ulubionych

**Aktor:** Uzytkownik  
**Cel:** szybki powrot do przepisu.

**Scenariusz glowny:**
1. Uzytkownik klika zapisanie przepisu.
2. System dodaje wpis do `favorites`.
3. System blokuje duplikat przez indeks unikalny `userId + recipeId`.

## UC-09 Utworzenie listy zakupow

**Aktor:** Uzytkownik  
**Cel:** wygenerowanie listy produktow na podstawie przepisu.

**Scenariusz glowny:**
1. Uzytkownik wybiera przepis i liczbe porcji.
2. System przelicza ilosci skladnikow.
3. System zapisuje dokument w `shoppingLists`.
4. Uzytkownik moze oznaczac produkty jako kupione.

## UC-10 Planowanie posilkow

**Aktor:** Uzytkownik  
**Cel:** przypisanie przepisu do dnia i typu posilku.

**Scenariusz glowny:**
1. Uzytkownik wybiera date, typ posilku i przepis.
2. System zapisuje wpis w `mealPlans`.
3. System zwraca plan posilkow dla wybranego zakresu dat.

## UC-11 Moderacja tresci

**Aktor:** Administrator  
**Cel:** kontrola jakosci przepisow i komentarzy.

**Scenariusz glowny:**
1. Administrator przeglada zgloszone tresci.
2. System wyswietla szczegoly zgloszenia.
3. Administrator ukrywa, przywraca albo usuwa tresc.
