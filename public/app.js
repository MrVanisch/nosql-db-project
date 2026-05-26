/**
 * CookFlow Frontend Application Logic.
 * Zarządza stanem aplikacji, routingiem (hash-based), interakcjami z API
 * oraz dynamiczną manipulacją drzewem DOM.
 */

/**
 * Główny obiekt stanu aplikacji (State Management).
 * Przechowuje dane o zalogowanym użytkowniku, przepisach, kategoriach i innych elementach UI.
 */
const state = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
  recipes: [],
  categories: [],
  selectedRecipe: null,
  shoppingLists: [],
  favorites: [],
  authMode: "login", // 'login' lub 'register'
  page: 1,
  pages: 1,
  lastParams: new URLSearchParams(), // Zapamiętuje ostatnie parametry wyszukiwania
  adminTab: "users", // Aktywna zakładka w panelu admina
  adminData: null,
  selectedPlanDate: null,
  totalRecipes: 0,
  formIngredients: [], // Składniki dodawane w formularzu nowego przepisu
  formSteps: [], // Kroki dodawane w formularzu nowego przepisu
};

/** Skrócona funkcja do pobierania elementów DOM */
const $ = (selector) => document.querySelector(selector);

/**
 * Uniwersalny wrapper dla żądań Fetch API do backendu.
 * Automatycznie dołącza nagłówki Content-Type oraz Authorization (jeśli token istnieje).
 * @param {string} path - Ścieżka API (np. '/recipes').
 * @param {RequestInit} options - Opcje żądania fetch.
 * @returns {Promise<any>} Sparsowane dane JSON.
 */
async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  
  const response = await fetch(`/api${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : null;
    
  if (!response.ok) {
    throw new Error(data?.error?.message || "Wystąpił błąd");
  }
  if (!data) {
    throw new Error(`API ${path} nie zwróciło JSON. Sprawdź, czy serwer został uruchomiony ponownie.`);
  }
  return data;
}

/** Wyświetla powiadomienie typu Toast na górze ekranu */
function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.remove("hidden");
  setTimeout(() => node.classList.add("hidden"), 3200);
}

/** Formatuje poziom trudności na język polski */
function formatDifficulty(value) {
  return { easy: "łatwy", medium: "średni", hard: "trudny" }[value] || value;
}

/** Formatuje typ posiłku na język polski */
function formatMeal(value) {
  return { breakfast: "Śniadanie", lunch: "Lunch", dinner: "Obiad", supper: "Kolacja", snack: "Przekąska" }[value] || value;
}

/**
 * Aktualizuje elementy interfejsu zależne od stanu zalogowania.
 * Zarządza widocznością przycisków profilu, wylogowania i panelu admina.
 */
function updateAccount() {
  const isLogged = Boolean(state.user);
  const isAdmin = state.user?.role === "admin";
  
  $("#authButton").classList.toggle("hidden", isLogged);
  $("#logoutButton").classList.toggle("hidden", !isLogged);
  $("#userInfo").classList.toggle("hidden", !isLogged);
  $("#adminNavLink").classList.toggle("hidden", !isAdmin);
  $("#admin").classList.toggle("hidden", !isAdmin);

  if (isLogged) {
    const name = state.user.profile?.displayName || state.user.username;
    $("#userBadge").textContent = name;
    
    const avatarUrl = state.user.profile?.avatarUrl;
    const avatarImg = $("#userAvatar");
    const initials = $("#avatarInitials");
    
    if (avatarUrl && avatarUrl.trim() !== "") {
      avatarImg.src = avatarUrl;
      avatarImg.onload = () => {
        avatarImg.style.display = "block";
        initials.style.display = "none";
      };
      avatarImg.onerror = () => {
        avatarImg.style.display = "none";
        initials.style.display = "grid";
      };
    } else {
      avatarImg.src = "";
      avatarImg.style.display = "none";
      initials.textContent = name.charAt(0).toUpperCase();
      initials.style.display = "grid";
    }
  }
}

/** Wczytuje dane do panelu administracyjnego (tylko dla adminów) */
async function loadAdminPanel() {
  if (state.user?.role !== "admin") return;
  const statsNode = $("#adminStats");
  const panelNode = $("#adminPanel");
  try {
    if (panelNode) panelNode.innerHTML = `<div class="admin-empty">Ladowanie panelu administratora...</div>`;
    
    // Równoległe pobieranie danych admina
    const [summary, users, comments, recipes, reports] = await Promise.all([
      api("/admin/summary"),
      api("/admin/users?limit=30"),
      api("/admin/comments?limit=30"),
      api("/admin/recipes?limit=30"),
      api("/admin/reports"),
    ]);
    
    if (!summary?.stats) {
      throw new Error("Endpoint /api/admin/summary nie zwrocil statystyk. Zrestartuj serwer aplikacji.");
    }
    
    state.adminData = { summary, users, comments, recipes, reports };
    renderAdminStats(summary.stats);
    renderAdminPanel();
  } catch (err) {
    state.adminData = null;
    if (statsNode) statsNode.innerHTML = "";
    if (panelNode) {
      panelNode.innerHTML = `
        <div class="admin-empty error-state">
          <strong>Nie udalo sie wczytac panelu administratora.</strong>
          <span>${escapeHtml(err.message)}</span>
        </div>
      `;
    }
    toast(err.message);
  }
}

/** Renderuje kafelki statystyk w panelu admina */
function renderAdminStats(stats) {
  const safeStats = {
    users: 0, admins: 0, recipes: 0, publishedRecipes: 0, comments: 0,
    hiddenComments: 0, favorites: 0, ratings: 0, shoppingLists: 0,
    mealPlans: 0, openReports: 0, ...stats,
  };
  $("#adminStats").innerHTML = [
    ["Uzytkownicy", safeStats.users, `${safeStats.admins} adminow`],
    ["Przepisy", safeStats.recipes, `${safeStats.publishedRecipes} publicznych`],
    ["Komentarze", safeStats.comments, `${safeStats.hiddenComments} ukrytych/usunietych`],
    ["Aktywnosc", safeStats.favorites + safeStats.ratings, `${safeStats.shoppingLists} list zakupow`],
    ["Plany", safeStats.mealPlans, "zaplanowane posilki"],
    ["Zgloszenia", safeStats.openReports, "otwarte sprawy"],
  ].map(([label, value, meta]) => `
    <article class="admin-stat">
      <span>${label}</span>
      <strong>${value}</strong>
      <small>${meta}</small>
    </article>
  `).join("");
}

/** Renderuje zawartość aktywnej zakładki panelu admina */
function renderAdminPanel() {
  if (!state.adminData) return;
  
  // Przełączanie klasy 'active' na przyciskach zakładek
  document.querySelectorAll(".admin-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.adminTab === state.adminTab);
  });
  
  const panel = $("#adminPanel");
  const usersData = { items: [], total: 0, ...state.adminData.users };
  const commentsData = { items: [], total: 0, ...state.adminData.comments };
  const recipesData = { items: [], total: 0, ...state.adminData.recipes };
  const reportsData = { items: [], ...state.adminData.reports };
  const summaryData = { topRecipes: [], newestUsers: [], newestComments: [], ...state.adminData.summary };
  
  if (state.adminTab === "users") {
    panel.innerHTML = `
      <div class="admin-table-head"><h3>Uzytkownicy</h3><span>${usersData.total} kont</span></div>
      <div class="admin-table">
        ${usersData.items.map((user) => `
          <div class="admin-row">
            <div>
              <strong>${escapeHtml(user.profile?.displayName || user.username)}</strong>
              <p>${escapeHtml(user.email)} • @${escapeHtml(user.username)}</p>
            </div>
            <span class="status-pill">${user.role}</span>
            <span class="status-pill ${user.status === "blocked" ? "danger" : ""}">${user.status || "active"}</span>
            <div class="admin-actions">
              <button class="btn small secondary" data-admin-user-role="${user._id}" data-role="${user.role === "admin" ? "user" : "admin"}">${user.role === "admin" ? "Rola user" : "Rola admin"}</button>
              <button class="btn small ${user.status === "blocked" ? "secondary" : "danger"}" data-admin-user-status="${user._id}" data-status="${user.status === "blocked" ? "active" : "blocked"}">${user.status === "blocked" ? "Odblokuj" : "Blokuj"}</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
    return;
  }

  if (state.adminTab === "reports") {
    panel.innerHTML = `
      <div class="admin-table-head"><h3>Zgloszenia</h3><span>${reportsData.items.length} spraw</span></div>
      <div class="admin-table">
        ${reportsData.items.map((report) => `
          <div class="admin-row comment-row">
            <div>
              <strong>${escapeHtml(report.reason || "Zgloszenie")}</strong>
              <p>Przepis: ${escapeHtml(String(report.recipeId || ""))}</p>
            </div>
            <span class="status-pill ${report.status === "new" ? "danger" : ""}">${report.status || "new"}</span>
            <div class="admin-actions">
              <button class="btn small secondary" data-admin-report="${report._id}" data-status="in_review">Sprawdzane</button>
              <button class="btn small secondary" data-admin-report="${report._id}" data-status="resolved">Rozwiazane</button>
              <button class="btn small danger" data-admin-report="${report._id}" data-status="rejected">Odrzuc</button>
            </div>
          </div>
        `).join("") || `<div class="admin-empty">Brak zgloszen.</div>`}
      </div>
    `;
    return;
  }
  
  if (state.adminTab === "comments") {
    panel.innerHTML = `
      <div class="admin-table-head"><h3>Moderacja komentarzy</h3><span>${commentsData.total} komentarzy</span></div>
      <div class="admin-table">
        ${commentsData.items.map((comment) => `
          <div class="admin-row comment-row">
            <div>
              <strong>${escapeHtml(comment.userSnapshot?.displayName || comment.userSnapshot?.username || "Uzytkownik")}</strong>
              <p>${escapeHtml(comment.body)}</p>
            </div>
            <span class="status-pill ${comment.status !== "visible" ? "danger" : ""}">${comment.status}</span>
            <div class="admin-actions">
              <button class="btn small secondary" data-admin-comment="${comment._id}" data-status="visible">Pokaz</button>
              <button class="btn small secondary" data-admin-comment="${comment._id}" data-status="hidden">Ukryj</button>
              <button class="btn small danger" data-admin-comment="${comment._id}" data-status="deleted">Usun</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
    return;
  }
  
  if (state.adminTab === "recipes") {
    panel.innerHTML = `
      <div class="admin-table-head"><h3>Zarzadzanie przepisami</h3><span>${recipesData.total} rekordow</span></div>
      <div class="admin-table">
        ${recipesData.items.map((recipe) => `
          <div class="admin-row">
            <div>
              <strong>${escapeHtml(recipe.title)}</strong>
              <p>${recipe.categorySlug} • ${recipe.ratingAvg || 0} ★ • ${recipe.favoriteCount || 0} zapisow</p>
            </div>
            <span class="status-pill ${recipe.status !== "published" ? "danger" : ""}">${recipe.status}</span>
            <div class="admin-actions">
              <button class="btn small secondary" data-admin-recipe="${recipe._id}" data-status="published">Publikuj</button>
              <button class="btn small secondary" data-admin-recipe="${recipe._id}" data-status="hidden">Ukryj</button>
              <button class="btn small danger" data-admin-recipe="${recipe._id}" data-status="draft">Szkic</button>
              <button class="btn small danger" data-admin-delete-recipe="${recipe._id}" data-title="${escapeHtml(recipe.title)}">Usun</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
    return;
  }
  
  // Domyślna zakładka: Przegląd (Overview)
  panel.innerHTML = `
    <div class="admin-overview">
      <div>
        <h3>Najpopularniejsze przepisy</h3>
        ${summaryData.topRecipes.map((recipe) => `<p><strong>${escapeHtml(recipe.title)}</strong><span>${recipe.favoriteCount || 0} zapisow • ${recipe.ratingAvg || 0} ★</span></p>`).join("") || "<p><span>Brak danych</span></p>"}
      </div>
      <div>
        <h3>Najnowsi uzytkownicy</h3>
        ${summaryData.newestUsers.map((user) => `<p><strong>${escapeHtml(user.profile?.displayName || user.username)}</strong><span>${escapeHtml(user.email)}</span></p>`).join("") || "<p><span>Brak danych</span></p>"}
      </div>
      <div>
        <h3>Ostatnie komentarze</h3>
        ${summaryData.newestComments.map((comment) => `<p><strong>${escapeHtml(comment.userSnapshot?.displayName || "Uzytkownik")}</strong><span>${escapeHtml(comment.body).slice(0, 110)}</span></p>`).join("") || "<p><span>Brak danych</span></p>"}
      </div>
    </div>
  `;
}

/** Pobiera kategorie z API i aktualizuje listy wyboru (select) w formularzach */
async function loadCategories() {
  const data = await api("/categories");
  state.categories = data.items;
  const options = [`<option value="">Wszystkie kategorie</option>`]
    .concat(state.categories.map((item) => `<option value="${item.slug}">${item.name}</option>`))
    .join("");
  $("#category").innerHTML = options;
  $("#newCategory").innerHTML = state.categories.map((item) => `<option value="${item.slug}">${item.name}</option>`).join("");
}

/**
 * Wczytuje listę przepisów z uwzględnieniem filtrów, wyszukiwania i paginacji.
 * @param {URLSearchParams} params - Parametry zapytania (query string).
 */
async function loadRecipes(params = new URLSearchParams()) {
  state.lastParams = new URLSearchParams(params);
  state.page = Number(params.get("page") || 1);
  params.set("page", String(state.page));
  params.set("limit", "48");
  
  const data = await api(`/recipes?${params.toString()}`);
  state.recipes = data.items;
  state.pages = data.pages || 1;
  $("#resultCount").textContent = `${data.total} przepisów`;
  
  renderRecipes();
  renderPagination();
  renderRecipeSelect();

  // Obliczanie całkowitej liczby przepisów dla statystyk Hero (tylko gdy nie ma filtrów)
  const isFiltered = params.get("q") || params.get("category") || params.get("difficulty") || params.get("maxTime") || params.get("minRating") || params.get("tags") || params.get("diet") || params.get("ingredients");
  if (!isFiltered) {
    state.totalRecipes = data.total;
  }
  updateHeroStats();
}

/** Renderuje siatkę kart przepisów w katalogu */
function renderRecipes() {
  const grid = $("#recipeGrid");
  if (!state.recipes.length) {
    grid.innerHTML = `<div class="list-item">Brak przepisów dla wybranych filtrów.</div>`;
    return;
  }
  grid.innerHTML = state.recipes.map((recipe) => `
    <article class="recipe-card">
      <img src="${recipe.image}" alt="${escapeHtml(recipe.title)}" loading="lazy">
      <div class="recipe-body">
        <div class="meta">
          <span>⏱ ${recipe.totalTimeMinutes} min</span>
          <span>•</span>
          <span>👨‍🍳 ${formatDifficulty(recipe.difficulty)}</span>
          <span>•</span>
          <span>★ ${recipe.ratingAvg.toFixed ? recipe.ratingAvg.toFixed(1) : recipe.ratingAvg}</span>
        </div>
        <h3>${escapeHtml(recipe.title)}</h3>
        <p class="muted">${escapeHtml(recipe.description)}</p>
        <div class="chip-row">${recipe.tags.slice(0, 3).map((tag) => `<span class="chip">#${tag}</span>`).join("")}</div>
        <div class="actions">
          <button class="btn small primary" data-open="${recipe.slug}">Szczegóły</button>
          <button class="btn small secondary" data-favorite="${recipe.id}">★ Zapisz</button>
        </div>
      </div>
    </article>
  `).join("");
}

/** Renderuje kontrolki paginacji */
function renderPagination() {
  const node = $("#pagination");
  if (!node || state.pages <= 1) {
    if (node) node.innerHTML = "";
    return;
  }

  const prevDisabled = state.page <= 1 ? "disabled" : "";
  const nextDisabled = state.page >= state.pages ? "disabled" : "";
  const start = Math.max(1, state.page - 2);
  const end = Math.min(state.pages, start + 4);
  const buttons = [];

  for (let page = start; page <= end; page += 1) {
    buttons.push(`<button class="page-btn ${page === state.page ? "active" : ""}" data-page="${page}">${page}</button>`);
  }

  node.innerHTML = `
    <button class="page-btn" data-page="${state.page - 1}" ${prevDisabled}>Poprzednia</button>
    ${buttons.join("")}
    <button class="page-btn" data-page="${state.page + 1}" ${nextDisabled}>Nastepna</button>
  `;
}

/**
 * Pobiera szczegóły przepisu po slugu i renderuje widok pełnoekranowy.
 * @param {string} slug - Unikalny identyfikator przyjazny dla URL.
 */
function canManageComment(comment) {
  if (!state.user) return false;
  const commentUserId = String(comment.userId || "");
  return state.user.role === "admin" || commentUserId === state.user.id;
}

function renderRecipeComments(comments = []) {
  if (!comments.length) return "<p class='muted'>Brak komentarzy. Badz pierwszy!</p>";
  return comments.map((comment) => {
    const author = comment.userSnapshot?.displayName || comment.userSnapshot?.username || "Uzytkownik";
    const actions = canManageComment(comment)
      ? `<div class="comment-actions">
          <button class="btn small secondary" type="button" data-edit-comment="${comment._id}">Edytuj</button>
          <button class="btn small danger" type="button" data-delete-comment="${comment._id}">Usun</button>
        </div>`
      : "";
    return `
      <div class="list-item comment-item">
        <div class="comment-body">
          <strong>${escapeHtml(author)}</strong>
          <p>${escapeHtml(comment.body)}</p>
        </div>
        ${actions}
      </div>
    `;
  }).join("");
}

async function openRecipe(slug) {
  if (!slug) return;
  const data = await api(`/recipes/${slug}`);
  state.selectedRecipe = data.recipe;
  const recipe = data.recipe;
  $("#recipeDetails").classList.remove("hidden");
  
  const formattedCategory = state.categories.find(c => c.slug === recipe.categorySlug)?.name || recipe.categorySlug;
  
  $("#recipeDetails").innerHTML = `
    <button class="btn secondary" data-go-home="true" style="margin-bottom: 24px; display: inline-flex; align-items: center; gap: 8px;">← Wróć do przepisów</button>
    <div class="detail-layout">
      <div>
        <img class="detail-media" src="${recipe.images?.[0]?.url || ""}" alt="${escapeHtml(recipe.title)}">
        <p class="eyebrow">${formattedCategory}</p>
        <h2>${escapeHtml(recipe.title)}</h2>
        <p class="muted">${escapeHtml(recipe.description)}</p>
        <div class="chip-row" style="margin-bottom: 24px;">
          ${(recipe.tags || []).map((tag) => `<span class="chip">#${tag}</span>`).join("")}
          ${(recipe.diets || []).map((diet) => `<span class="chip" style="background:#fdf2e9; color:#b05c2e;">${diet}</span>`).join("")}
        </div>
        <h3>Składniki</h3>
        <ul style="margin-bottom: 24px;">
          ${recipe.ingredients.map((item) => `<li><strong>${escapeHtml(item.name)}</strong>: ${item.quantity} ${escapeHtml(item.unit)}</li>`).join("")}
        </ul>
        <h3>Przygotowanie krok po kroku (kliknij krok, aby odznaczyć)</h3>
        <ol class="step-list">
          ${recipe.steps.map((step) => `
            <li class="step-card" data-toggle-step="true">
              <span class="step-number">${step.order}</span>
              <div>
                <p>${escapeHtml(step.instruction)}</p>
                <span class="muted">${step.durationMinutes || 5} min</span>
              </div>
            </li>
          `).join("")}
        </ol>
        
        <h3 style="border-top: 1px solid var(--line); padding-top: 24px;">Komentarze</h3>
        <div id="comments">
          ${data.comments.map((comment) => `
            <div class="list-item" style="flex-direction: column; align-items: flex-start; gap: 4px;">
              <strong>👤 ${escapeHtml(comment.userSnapshot.displayName)}</strong>
              <p style="margin: 0; font-size: 15px; color:#2c3531;">${escapeHtml(comment.body)}</p>
            </div>
          `).join("") || "<p class='muted'>Brak komentarzy. Bądź pierwszy!</p>"}
        </div>
        <form id="commentForm" class="stack">
          <textarea id="commentBody" placeholder="Napisz komentarz..." required minlength="2" style="background:#fff;"></textarea>
          <button class="btn primary" type="submit">Dodaj komentarz</button>
        </form>
      </div>
      <aside class="facts">
        <div class="facts" style="position: sticky; top: 96px;">
          <div class="fact"><span>Ocena społeczności</span><strong>★ ${recipe.ratingAvg || 0} / 5</strong></div>
          <div class="fact"><span>Liczba ocen</span><strong>${recipe.ratingCount || 0}</strong></div>
          <div class="fact"><span>Porcje</span><strong>${recipe.servings}</strong></div>
          <div class="fact"><span>Czas całkowity</span><strong>${recipe.totalTimeMinutes} min</strong></div>
          <div class="fact"><span>Kalorie</span><strong>${recipe.nutrition?.calories || 0} kcal</strong></div>
          <div class="fact" style="grid-template-columns: 1fr; border-bottom:0; padding-bottom:0;">
            <span style="margin-bottom:8px; display:block;">Wartości odżywcze:</span>
            <div style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 8px; width:100%; text-align:center; font-size:12px;">
              <div style="background:var(--bg); padding:6px; border-radius:6px;">B: ${recipe.nutrition?.protein || 0}g</div>
              <div style="background:var(--bg); padding:6px; border-radius:6px;">T: ${recipe.nutrition?.fat || 0}g</div>
              <div style="background:var(--bg); padding:6px; border-radius:6px;">W: ${recipe.nutrition?.carbs || 0}g</div>
            </div>
          </div>
          <button class="btn primary" style="width: 100%; margin-top: 10px;" data-shopping="${recipe._id || recipe.id}">🛒 Generuj listę zakupów</button>
          
          <div style="border-top: 1px solid var(--line); margin-top: 10px; padding-top: 16px; text-align:center;">
            <p class="muted" style="font-size:13px; font-weight:700; margin-bottom:8px;">Oceń ten przepis:</p>
            <div class="actions" style="justify-content: center; gap: 6px; margin-top: 0;">
              ${[1,2,3,4,5].map((value) => `<button class="icon-btn" style="background:#eef5f1; color:var(--accent); font-weight:800;" data-rate="${value}" title="Ocena ${value}">${value}★</button>`).join("")}
            </div>
          </div>
        </div>
      </aside>
    </div>
  `;
  $("#comments").innerHTML = renderRecipeComments(data.comments);
}

// Lokalny cache dla wszystkich przepisów (używany do autouzupełniania wyszukiwania)
let allRecipesCache = null;

/** Pobiera wszystkie przepisy (maksymalnie 250) do lokalnego przeszukiwania/podpowiedzi */
async function getAllRecipes() {
  if (allRecipesCache) return allRecipesCache;
  try {
    const data = await api("/recipes?limit=250");
    allRecipesCache = data.items;
    return allRecipesCache;
  } catch (err) {
    console.error("Error loading recipes for search:", err);
    return state.recipes || [];
  }
}

/** Czyści cache przepisów przy zmianach strukturalnych */
function renderRecipeSelect() {
  allRecipesCache = null;
}

/** Aktualizuje liczbowe statystyki w sekcji Hero */
function updateHeroStats() {
  const recipesCountEl = $("#statRecipesCount");
  if (recipesCountEl && state.totalRecipes) {
    recipesCountEl.textContent = String(state.totalRecipes);
  }
  const categoriesCountEl = $("#statCategoriesCount");
  if (categoriesCountEl && state.categories) {
    categoriesCountEl.textContent = String(state.categories.length);
  }
  const shoppingCountEl = $("#statShoppingListsCount");
  if (shoppingCountEl) {
    if (state.user && state.shoppingLists && state.shoppingLists.length > 0) {
      shoppingCountEl.textContent = String(state.shoppingLists.length);
      const span = shoppingCountEl.nextElementSibling;
      if (span) span.textContent = state.shoppingLists.length === 1 ? "Twoja lista" : state.shoppingLists.length < 5 ? "Twoje listy" : "Twoich list";
    } else {
      shoppingCountEl.textContent = "1 klik";
      const span = shoppingCountEl.nextElementSibling;
      if (span) span.textContent = "generowanie list";
    }
  }
}

// --- FUNKCJE GLOBALNE DLA HANDLERÓW ONCLICK W HTML ---

/** Zmienia fragment URL, co wywołuje router i otwiera przepis */
window.openRecipeBySlug = (slug) => {
  location.hash = `#recipe/${slug}`;
};

/**
 * Otwiera modal z interaktywną listą zakupów.
 * Zarządza edycją nazw, ilości, usuwaniem i odznaczaniem produktów.
 * @param {string} id - ID listy zakupów.
 */
window.viewShoppingList = (id) => {
  const list = state.shoppingLists.find(l => (l._id || l.id) === id);
  if (!list) return;
  
  const updateTitle = () => {
    $("#shoppingListName").textContent = list.name;
  };
  updateTitle();
  
  // Zmiana nazwy listy zakupów
  $("#renameShoppingListBtn").onclick = async () => {
    const newListName = prompt("Zmień nazwę listy zakupów:", list.name);
    if (newListName && newListName.trim()) {
      list.name = newListName.trim();
      updateTitle();
      try {
        await api(`/me/shopping-lists/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ name: list.name }),
        });
        await loadPrivatePanels();
        toast("Nazwa listy została zmieniona!");
      } catch (err) {
        toast("Błąd zmiany nazwy: " + err.message);
      }
    }
  };
  
  const updateMeta = () => {
    const checkedCount = list.items.filter(i => i.checked).length;
    $("#shoppingListMeta").textContent = `${checkedCount} z ${list.items.length} zakupionych produktów`;
  };
  updateMeta();

  /** Aktualizuje statystyki w tle po zmianach w liście zakupów */
  const updateBackgroundStats = () => {
    const shoppingItemCount = state.shoppingLists.reduce((sum, list) => sum + list.items.length, 0);
    const shoppingCheckedCount = state.shoppingLists.reduce((sum, list) => sum + list.items.filter(i => i.checked).length, 0);
    $("#shoppingCheckedCount").textContent = String(shoppingCheckedCount);
    
    const cardMain = $(`[data-view-shopping-list="${id}"]`);
    if (cardMain) {
      const checked = list.items.filter(i => i.checked).length;
      const progress = list.items.length ? Math.round((checked / list.items.length) * 100) : 0;
      
      const spanText = cardMain.querySelector("span:not(.saved-card-type):not(.progress-track)");
      if (spanText) {
        spanText.textContent = `${list.items.length} produktów • ${checked} kupionych`;
      }
      
      const progressTrackInner = cardMain.querySelector(".progress-track span");
      if (progressTrackInner) {
        progressTrackInner.style.width = `${progress}%`;
      }
    }
    
    updateHeroStats();
  };

  /** Renderuje listę produktów wewnątrz dialogu */
  const renderItems = () => {
    $("#shoppingListItems").innerHTML = list.items.length
      ? list.items.map((item, index) => `
        <div class="shopping-item-row ${item.checked ? 'checked' : ''}" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; width: 100%;" data-toggle-shopping="${id}" data-item-index="${index}">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <input type="checkbox" class="shopping-item-checkbox" ${item.checked ? 'checked' : ''} data-toggle-shopping="${id}" data-item-index="${index}">
            <span class="shopping-item-text" style="${item.checked ? 'text-decoration: line-through; color: var(--muted);' : ''}">${escapeHtml(item.name)} - <strong>${item.quantity} ${escapeHtml(item.unit)}</strong></span>
          </div>
          <div class="shopping-item-actions" style="display: flex; gap: 6px;">
            <button class="btn text small" style="padding: 4px 8px; font-size: 12px; border: 1px solid var(--line); border-radius: 4px; background: #fff; cursor: pointer; color: var(--accent);" data-edit-shopping-item="${id}" data-item-index="${index}" title="Edytuj produkt">✏️</button>
            <button class="btn text small danger" style="padding: 4px 8px; font-size: 12px; border: 1px solid #ffd9d6; border-radius: 4px; background: #ffd9d6; color: var(--danger); cursor: pointer;" data-delete-shopping-item="${id}" data-item-index="${index}" title="Usuń produkt">×</button>
          </div>
        </div>
      `).join("")
      : `<div class="empty-state" style="text-align: center; padding: 16px;">Brak produktów na liście. Dodaj coś powyżej!</div>`;
  };

  /** Usuwa produkt z listy zakupów */
  window.deleteShoppingItemRow = async (listId, itemIndex) => {
    const targetList = state.shoppingLists.find(l => (l._id || l.id) === listId);
    if (!targetList) return;
    
    if (!confirm(`Czy na pewno chcesz usunąć "${targetList.items[itemIndex].name}" z listy?`)) return;
    
    targetList.items.splice(itemIndex, 1);
    renderItems();
    updateMeta();
    updateBackgroundStats();
    
    try {
      await api(`/me/shopping-lists/${listId}`, {
        method: "PATCH",
        body: JSON.stringify({ items: targetList.items }),
      });
      await loadPrivatePanels();
      toast("Produkt został usunięty");
    } catch (err) {
      toast("Błąd zapisu listy: " + err.message);
    }
  };

  /** Edytuje parametry produktu (nazwa, ilość, jednostka) */
  window.editShoppingItem = async (listId, itemIndex) => {
    const targetList = state.shoppingLists.find(l => (l._id || l.id) === listId);
    if (!targetList) return;
    const item = targetList.items[itemIndex];
    
    const newName = prompt("Edytuj nazwę produktu:", item.name);
    if (newName === null) return;
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    
    const newQtyStr = prompt("Edytuj ilość:", item.quantity);
    if (newQtyStr === null) return;
    const newQty = Number(newQtyStr || 1);
    
    const newUnit = prompt("Edytuj jednostkę:", item.unit);
    if (newUnit === null) return;
    
    item.name = trimmedName;
    item.quantity = isNaN(newQty) ? item.quantity : newQty;
    item.unit = newUnit.trim() || item.unit;
    
    renderItems();
    updateMeta();
    updateBackgroundStats();
    
    try {
      await api(`/me/shopping-lists/${listId}`, {
        method: "PATCH",
        body: JSON.stringify({ items: targetList.items }),
      });
      await loadPrivatePanels();
      toast("Produkt został zaktualizowany");
    } catch (err) {
      toast("Błąd zapisu produktu: " + err.message);
    }
  };

  /** Przełącza stan 'kupiony' (checkbox) dla produktu */
  window.toggleShoppingItem = async (listId, itemIndex) => {
    const targetList = state.shoppingLists.find(l => (l._id || l.id) === listId);
    if (!targetList) return;
    
    targetList.items[itemIndex].checked = !targetList.items[itemIndex].checked;
    renderItems();
    updateMeta();
    updateBackgroundStats();

    try {
      await api(`/me/shopping-lists/${listId}`, {
        method: "PATCH",
        body: JSON.stringify({ items: targetList.items }),
      });
      await loadPrivatePanels();
    } catch (err) {
      toast("Błąd zapisu stanu: " + err.message);
    }
  };

  // Dodawanie nowego produktu do istniejącej listy
  $("#addShoppingItemForm").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#newShoppingItemName").value.trim();
    const qty = Number($("#newShoppingItemQty").value || 1);
    const unit = $("#newShoppingItemUnit").value.trim() || "szt";
    
    if (!name) return;
    
    list.items.push({ name, quantity: qty, unit, checked: false });
    
    $("#newShoppingItemName").value = "";
    $("#newShoppingItemQty").value = "1";
    $("#newShoppingItemUnit").value = "szt";
    
    renderItems();
    updateMeta();
    updateBackgroundStats();
    
    try {
      await api(`/me/shopping-lists/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ items: list.items }),
      });
      await loadPrivatePanels();
      toast("Dodano produkt do listy!");
    } catch (err) {
      toast("Błąd zapisu produktu: " + err.message);
    }
  };

  $("#deleteShoppingListBtn").onclick = () => {
    window.deleteShoppingList(id);
  };

  renderItems();
  $("#shoppingListDialog").showModal();
};

/** Usuwa całą listę zakupów */
window.deleteShoppingList = async (id) => {
  if (!confirm("Czy na pewno chcesz usunąć tę listę zakupów?")) return;
  try {
    await api(`/me/shopping-lists/${id}`, { method: "DELETE" });
    $("#shoppingListDialog").close();
    await loadPrivatePanels();
    toast("Lista zakupów została usunięta");
  } catch (err) {
    toast(err.message);
  }
};

/** Usuwa przepis z ulubionych */
window.removeFavorite = async (recipeId) => {
  try {
    await api(`/me/favorites/${recipeId}`, { method: "DELETE" });
    await loadPrivatePanels();
    toast("Usunięto z ulubionych");
  } catch (err) {
    toast(err.message);
  }
};

/** Usuwa pozycję z planera posiłków */
window.deleteMealPlan = async (planId) => {
  try {
    await api(`/me/meal-plans/${planId}`, { method: "DELETE" });
    await loadPrivatePanels();
    toast("Posiłek usunięty z planu");
  } catch (err) {
    toast(err.message);
  }
};

/**
 * Wczytuje dane użytkownika (ulubione, listy zakupów, plany posiłków)
 * i renderuje je w odpowiednich zakładkach profilu.
 */
async function loadPrivatePanels() {
  if (!state.user) {
    // Widok dla niezalogowanego
    $("#favoriteList").innerHTML = `<div class="empty-state">Zaloguj się, aby zobaczyć ulubione przepisy.</div>`;
    $("#shoppingList").innerHTML = `<div class="empty-state">Zaloguj się, aby zobaczyć swoje listy zakupów.</div>`;
    $("#mealList").innerHTML = `<div class="empty-state">Zaloguj się, aby zaplanować posiłki.</div>`;
    $("#shoppingListCount").textContent = "0";
    $("#shoppingItemCount").textContent = "0";
    $("#shoppingCheckedCount").textContent = "0";
    updateHeroStats();
    return;
  }
  
  const [favorites, lists, plans] = await Promise.all([
    api("/me/favorites"),
    api("/me/shopping-lists"),
    api("/me/meal-plans"),
  ]);
  
  state.shoppingLists = lists.items;
  const shoppingItemCount = lists.items.reduce((sum, list) => sum + list.items.length, 0);
  const shoppingCheckedCount = lists.items.reduce((sum, list) => sum + list.items.filter(i => i.checked).length, 0);
  $("#shoppingListCount").textContent = String(lists.items.length);
  $("#shoppingItemCount").textContent = String(shoppingItemCount);
  $("#shoppingCheckedCount").textContent = String(shoppingCheckedCount);
  updateHeroStats();

  // Renderowanie ulubionych
  $("#favoriteList").innerHTML = favorites.items.length
    ? favorites.items.map((item) => `
        <article class="saved-recipe-card">
          <button class="saved-card-main" type="button" data-open-saved="${item.recipeSnapshot.slug}">
            <span class="saved-card-type">Przepis</span>
            <strong>${escapeHtml(item.recipeSnapshot.title)}</strong>
            <span>${item.recipeSnapshot.totalTimeMinutes} min • ${item.recipeSnapshot.ratingAvg} ★</span>
          </button>
          <button class="list-item-action-btn" data-remove-favorite="${item.recipeId}" title="Usuń z ulubionych">×</button>
        </article>
      `).join("")
    : `<div class="empty-state">
         <strong>Brak ulubionych przepisów.</strong>
         <span>Kliknij gwiazdkę przy przepisie, aby dodać go tutaj.</span>
       </div>`;

  // Renderowanie kart list zakupów
  $("#shoppingList").innerHTML = lists.items.length
    ? lists.items.map((list) => {
        const checked = list.items.filter(i => i.checked).length;
        const progress = list.items.length ? Math.round((checked / list.items.length) * 100) : 0;
        return `
        <article class="shopping-card">
          <button class="shopping-card-main" type="button" data-view-shopping-list="${list._id || list.id}">
            <span class="saved-card-type">Lista zakupów</span>
            <strong>${escapeHtml(list.name)}</strong>
            <span>${list.items.length} produktów • ${checked} kupionych</span>
            <span class="progress-track"><span style="width:${progress}%"></span></span>
          </button>
          <button class="list-item-action-btn" data-delete-shopping-list="${list._id || list.id}" title="Usuń listę">×</button>
        </article>
      `;
      }).join("")
    : `<div class="empty-state">
         <strong>Brak list zakupów.</strong>
         <span>Wygeneruj listę z poziomu szczegółów dowolnego przepisu.</span>
       </div>`;

  // Grupowanie planów posiłków po dacie dla kalendarza
  const groupedPlans = {};
  plans.items.forEach(plan => {
    const dateStr = plan.plannedFor;
    if (!groupedPlans[dateStr]) groupedPlans[dateStr] = [];
    groupedPlans[dateStr].push(plan);
  });

  // Renderowanie paska kalendarza (najbliższe 7 dni)
  const today = new Date();
  const calendarStrip = $("#calendarStrip");
  if (calendarStrip) {
    const stripHtml = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(today.getDate() + i);
      const dateStr = d.toISOString().slice(0, 10);

      const dayName = d.toLocaleDateString("pl-PL", { weekday: "short" });
      const dayNum = d.getDate();
      const hasMeals = groupedPlans[dateStr] && groupedPlans[dateStr].length > 0;
      const isSelected = state.selectedPlanDate === dateStr ? "active" : "";

      stripHtml.push(`
        <div class="calendar-day-btn ${isSelected}" data-calendar-day="${dateStr}">
          <span class="day-name">${dayName}</span>
          <strong class="day-number">${dayNum}</strong>
          ${hasMeals ? `<span class="day-dot"></span>` : ""}
        </div>
      `);
    }
    calendarStrip.innerHTML = stripHtml.join("");
  }

  // Filtrowanie wyświetlanych posiłków na podstawie wybranej daty w kalendarzu
  let displayedPlans = plans.items;
  if (state.selectedPlanDate) {
    displayedPlans = plans.items.filter(p => p.plannedFor === state.selectedPlanDate);
    $("#clearCalendarFilter")?.classList.remove("hidden");
  } else {
    $("#clearCalendarFilter")?.classList.add("hidden");
  }

  // Sortowanie chronologiczne
  displayedPlans.sort((a, b) => a.plannedFor.localeCompare(b.plannedFor));

  const displayGrouped = {};
  displayedPlans.forEach(plan => {
    const dateStr = plan.plannedFor;
    if (!displayGrouped[dateStr]) displayGrouped[dateStr] = [];
    displayGrouped[dateStr].push(plan);
  });

  const sortedDisplayDates = Object.keys(displayGrouped).sort();

  // Renderowanie listy posiłków w planerze
  if (sortedDisplayDates.length) {
    const mealTypeNames = {
      breakfast: "Śniadanie", lunch: "Lunch", dinner: "Obiad", supper: "Kolacja", snack: "Przekąska",
    };

    $("#mealList").innerHTML = sortedDisplayDates.map(dateStr => {
      const dateObj = new Date(dateStr);
      const formattedDate = dateObj.toLocaleDateString("pl-PL", {
        weekday: "long", day: "numeric", month: "long",
      });

      const dayMeals = displayGrouped[dateStr];
      const mealOrder = ["breakfast", "lunch", "dinner", "supper", "snack"];
      dayMeals.sort((a, b) => mealOrder.indexOf(a.mealType) - mealOrder.indexOf(b.mealType));

      return `
        <div class="daily-schedule">
          <div class="daily-schedule-header">
            <span class="schedule-icon">📅</span>
            <h3>${escapeHtml(formattedDate)}</h3>
            <span class="meal-count-badge">${dayMeals.length} ${dayMeals.length === 1 ? 'posiłek' : dayMeals.length < 5 ? 'posiłki' : 'posiłków'}</span>
          </div>
          <div class="daily-meals-grid">
            ${dayMeals.map(plan => `
              <div class="premium-meal-card ${plan.mealType}">
                <div class="meal-card-img-wrapper" data-open-saved="${plan.recipeSnapshot?.slug || ""}">       
                  <img src="${plan.recipeSnapshot?.image || '/images/default.jpg'}" alt="${escapeHtml(plan.recipeSnapshot?.title || 'Przepis')}">
                </div>
                <div class="meal-card-content" data-open-saved="${plan.recipeSnapshot?.slug || ""}">
                  <span class="meal-badge ${plan.mealType}">${mealTypeNames[plan.mealType] || plan.mealType}</span>
                  <h4>${escapeHtml(plan.recipeSnapshot?.title || "Przepis")}</h4>
                  <span class="meal-servings">🍽️ ${plan.servings} porcje</span>
                </div>
                <button class="meal-card-delete-btn" data-delete-meal-plan="${plan._id || plan.id}" title="Usuń z planu">×</button>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");
  } else {
    $("#mealList").innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 32px 16px;">
        <span style="font-size: 32px; display: block; margin-bottom: 8px;">🍽️</span>
        <strong>Brak zaplanowanych posiłków</strong>
        <span class="muted">${state.selectedPlanDate ? 'na ten dzień.' : 'na najbliższe dni.'} Użyj formularza po lewej stronie, aby dodać posiłki.</span>
      </div>
    `;
  }
}

/** Renderuje listę składników w formularzu dodawania przepisu */
function renderFormIngredients() {
  const container = $("#ingredientsList");
  if (!container) return;
  if (!state.formIngredients || state.formIngredients.length === 0) {
    container.innerHTML = `<span class="muted" style="font-size: 13px;">Brak dodanych składników. Użyj pól poniżej, aby dodać.</span>`;
    return;
  }
  container.innerHTML = state.formIngredients.map((ing, index) => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 6px 10px; border-radius: 6px; margin-bottom: 6px; border: 1px solid var(--line); font-size: 13px;">
      <span><strong>${escapeHtml(ing.name)}</strong> - ${ing.quantity} ${escapeHtml(ing.unit)} ${ing.note ? `<span class="muted">(${escapeHtml(ing.note)})</span>` : ''}</span>
      <button type="button" class="btn text-btn" onclick="removeFormIngredient(${index})" style="color: var(--accent); padding: 2px 6px; margin: 0; font-size: 12px; font-weight: 700; cursor: pointer; background: transparent; border: none;">Usuń ❌</button>
    </div>
  `).join("");
}

/** Renderuje listę kroków przygotowania w formularzu dodawania przepisu */
function renderFormSteps() {
  const container = $("#stepsList");
  if (!container) return;
  if (!state.formSteps || state.formSteps.length === 0) {
    container.innerHTML = `<span class="muted" style="font-size: 13px;">Brak dodanych kroków. Użyj pól poniżej, aby dodać.</span>`;
    return;
  }
  container.innerHTML = state.formSteps.map((step, index) => `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; background: #fff; padding: 8px 10px; border-radius: 6px; margin-bottom: 6px; border: 1px solid var(--line); font-size: 13px; gap: 10px;">
      <div style="flex: 1;">
        <span style="font-weight: 700; color: var(--accent); margin-right: 6px;">Krok ${step.order}:</span>
        <span>${escapeHtml(step.instruction)}</span>
        ${step.durationMinutes ? `<span class="muted" style="display: block; font-size: 11px; margin-top: 2px;">⏱️ Czas trwania: ${step.durationMinutes} min</span>` : ''}
      </div>
      <button type="button" class="btn text-btn" onclick="removeFormStep(${index})" style="color: var(--accent); padding: 2px 6px; margin: 0; font-size: 12px; font-weight: 700; cursor: pointer; background: transparent; border: none; white-space: nowrap;">Usuń ❌</button>
    </div>
  `).join("");
}

window.removeFormIngredient = function(index) {
  state.formIngredients.splice(index, 1);
  renderFormIngredients();
};

window.removeFormStep = function(index) {
  state.formSteps.splice(index, 1);
  state.formSteps.forEach((step, i) => { step.order = i + 1; });
  renderFormSteps();
};

/** Dodaje składnik wpisany w pola formularza do lokalnej listy w stanie */
function addIngredientFromForm() {
  const nameInput = $("#ingNameInput");
  const qtyInput = $("#ingQtyInput");
  const unitInput = $("#ingUnitInput");
  
  if (!nameInput || !qtyInput || !unitInput) return;
  
  const name = nameInput.value.trim();
  const quantity = Number(qtyInput.value);
  const unit = unitInput.value.trim();
  
  if (!name) { toast("Wpisz nazwę składnika!"); nameInput.focus(); return; }
  if (name.length < 2) { toast("Nazwa składnika musi mieć co najmniej 2 znaki!"); nameInput.focus(); return; }
  if (isNaN(quantity) || quantity <= 0) { toast("Ilość musi być liczbą dodatnią!"); qtyInput.focus(); return; }
  if (!unit) { toast("Jednostka nie może być pusta!"); unitInput.focus(); return; }
  
  state.formIngredients.push({ name, quantity, unit, note: "" });
  renderFormIngredients();
  
  nameInput.value = "";
  qtyInput.value = "1";
  nameInput.focus();
}

/** Dodaje krok przygotowania wpisany w pola formularza do lokalnej listy w stanie */
function addStepFromForm() {
  const instrInput = $("#stepInstructionInput");
  const durInput = $("#stepDurationInput");
  
  if (!instrInput || !durInput) return;
  
  const instruction = instrInput.value.trim();
  const durationMinutes = Number(durInput.value || 0);
  
  if (!instruction) { toast("Wpisz opis kroku!"); instrInput.focus(); return; }
  if (instruction.length < 6) { toast("Opis kroku musi mieć co najmniej 6 znaków!"); instrInput.focus(); return; }
  if (isNaN(durationMinutes) || durationMinutes < 0) { toast("Czas trwania musi być liczbą nieujemną!"); durInput.focus(); return; }
  
  const order = state.formSteps.length + 1;
  state.formSteps.push({ order, instruction, durationMinutes });
  renderFormSteps();
  
  instrInput.value = "";
  durInput.value = "5";
  instrInput.focus();
}

/** Pomocnicza funkcja do parsowania tekstu na listę (np. tagi po przecinku) */
function listFromInput(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Zabezpiecza tekst przed atakami XSS poprzez zamianę znaków specjalnych HTML */
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
}

/** Otwiera modal logowania/rejestracji w wybranym trybie */
function openAuth(mode = "login") {
  state.authMode = mode;
  $("#loginTab").classList.toggle("active", mode === "login");
  $("#registerTab").classList.toggle("active", mode === "register");
  document.querySelectorAll(".register-only").forEach((node) => node.classList.toggle("hidden", mode !== "register"));
  $("#submitAuth").textContent = mode === "login" ? "Zaloguj się" : "Utwórz konto";
  $("#authError").classList.add("hidden");
  $("#authDialog").showModal();
}

/** Wysyła formularz autentykacji do API i zapisuje token w LocalStorage */
async function submitAuth() {
  const body = {
    email: $("#authEmail").value,
    password: $("#authPassword").value,
  };
  if (state.authMode === "register") body.username = $("#authUsername").value;
  try {
    const data = await api(state.authMode === "login" ? "/auth/login" : "/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem("token", state.token);
    localStorage.setItem("user", JSON.stringify(state.user));
    $("#authDialog").close();
    updateAccount();
    await loadPrivatePanels();
    await loadAdminPanel();
    toast("Pomyślnie zalogowano!");
  } catch (err) {
    $("#authError").textContent = err.message;
    $("#authError").classList.remove("hidden");
  }
}

/** Sprawdza czy użytkownik jest zalogowany, jeśli nie - otwiera modal logowania */
function requireLogin() {
  if (!state.user) {
    openAuth("login");
    return false;
  }
  return true;
}

/**
 * GLOBALNY EVENT LISTENER DLA KLIKNIĘĆ (Event Delegation).
 * Obsługuje dynamicznie dodawane elementy DOM poprzez sprawdzanie atrybutów 'data-*'.
 */
document.addEventListener("click", async (event) => {
  // Przycisk otwierający przepis
  const open = event.target.closest("[data-open]");
  // Przycisk dodawania do ulubionych
  const favorite = event.target.closest("[data-favorite]");
  // Przycisk generowania listy zakupów
  const shopping = event.target.closest("[data-shopping]");
  // Przycisk oceny gwiazdkowej
  const rate = event.target.closest("[data-rate]");
  // Przycisk zmiany strony (paginacja)
  const page = event.target.closest("[data-page]");
  // Przycisk zamykania dialogu
  const closeDialog = event.target.closest("[data-close-dialog]");
  // Przycisk powrotu na stronę główną
  const goHome = event.target.closest("[data-go-home]");
  // Kliknięcie w krok przygotowania (oznaczenie jako gotowy)
  const toggleStep = event.target.closest("[data-toggle-step]");
  // Otwieranie zapisanego przepisu (z planera lub ulubionych)
  const openSaved = event.target.closest("[data-open-saved]");
  const removeFavoriteBtn = event.target.closest("[data-remove-favorite]");
  const viewShoppingBtn = event.target.closest("[data-view-shopping-list]");
  const deleteShoppingBtn = event.target.closest("[data-delete-shopping-list]");
  const toggleShoppingBtn = event.target.closest("[data-toggle-shopping]");
  const deleteMealBtn = event.target.closest("[data-delete-meal-plan]");
  const calendarDayBtn = event.target.closest("[data-calendar-day]");
  const clearCalendarFilter = event.target.closest("#clearCalendarFilter");
  const editShoppingItemBtn = event.target.closest("[data-edit-shopping-item]");
  const deleteShoppingItemBtn = event.target.closest("[data-delete-shopping-item]");
  const editCommentBtn = event.target.closest("[data-edit-comment]");
  const deleteCommentBtn = event.target.closest("[data-delete-comment]");

  if (editCommentBtn) {
    const existing = state.selectedRecipe ? Array.from(document.querySelectorAll("[data-edit-comment]")).find((btn) => btn.dataset.editComment === editCommentBtn.dataset.editComment) : null;
    const currentText = existing?.closest(".comment-item")?.querySelector(".comment-body p")?.textContent || "";
    const body = prompt("Edytuj komentarz:", currentText);
    if (body === null) return;
    try {
      await api(`/comments/${editCommentBtn.dataset.editComment}`, {
        method: "PATCH",
        body: JSON.stringify({ body: body.trim() }),
      });
      toast("Komentarz zostal zaktualizowany");
      await openRecipe(state.selectedRecipe.slug);
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  if (deleteCommentBtn) {
    if (!confirm("Usunac ten komentarz?")) return;
    try {
      await api(`/comments/${deleteCommentBtn.dataset.deleteComment}`, { method: "DELETE" });
      toast("Komentarz zostal usuniety");
      await openRecipe(state.selectedRecipe.slug);
    } catch (err) {
      toast(err.message);
    }
    return;
  }

  if (editShoppingItemBtn) {
    event.stopPropagation();
    await window.editShoppingItem?.(editShoppingItemBtn.dataset.editShoppingItem, Number(editShoppingItemBtn.dataset.itemIndex));
    return;
  }

  if (deleteShoppingItemBtn) {
    event.stopPropagation();
    await window.deleteShoppingItemRow?.(deleteShoppingItemBtn.dataset.deleteShoppingItem, Number(deleteShoppingItemBtn.dataset.itemIndex));
    return;
  }

  if (calendarDayBtn) {
    const selectedDate = calendarDayBtn.dataset.calendarDay;
    state.selectedPlanDate = state.selectedPlanDate === selectedDate ? null : selectedDate;
    await loadPrivatePanels();
    return;
  }

  if (clearCalendarFilter) {
    state.selectedPlanDate = null;
    await loadPrivatePanels();
    return;
  }

  if (closeDialog) {
    document.getElementById(closeDialog.dataset.closeDialog)?.close();
    return;
  }

  if (goHome) { location.hash = "#home"; return; }

  if (toggleStep) { toggleStep.classList.toggle("completed"); return; }

  if (openSaved) {
    const slug = openSaved.dataset.openSaved;
    if (slug) location.hash = `#recipe/${slug}`;
    return;
  }

  if (removeFavoriteBtn) {
    await window.removeFavorite(removeFavoriteBtn.dataset.removeFavorite);
    return;
  }

  if (viewShoppingBtn) {
    window.viewShoppingList(viewShoppingBtn.dataset.viewShoppingList);
    return;
  }

  if (deleteShoppingBtn) {
    await window.deleteShoppingList(deleteShoppingBtn.dataset.deleteShoppingList);
    return;
  }

  if (toggleShoppingBtn) {
    event.stopPropagation();
    await window.toggleShoppingItem?.(toggleShoppingBtn.dataset.toggleShopping, Number(toggleShoppingBtn.dataset.itemIndex));
    return;
  }

  if (deleteMealBtn) {
    await window.deleteMealPlan(deleteMealBtn.dataset.deleteMealPlan);
    return;
  }

  if (page) {
    const nextPage = Number(page.dataset.page);
    if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > state.pages) return;
    const params = new URLSearchParams(state.lastParams);
    params.set("page", String(nextPage));
    await loadRecipes(params);
    location.hash = "home";
  }
  
  if (open) {
    location.hash = `#recipe/${open.dataset.open}`;
  }
  
  if (favorite) {
    if (!requireLogin()) return;
    try {
      await api(`/me/favorites/${favorite.dataset.favorite}`, { method: "POST" });
      await loadPrivatePanels();
      toast("Dodano przepis do ulubionych!");
    } catch (err) {
      toast("Przepis jest już w ulubionych");
    }
  }
  
  if (shopping) {
    if (!requireLogin()) return;
    try {
      await api(`/recipes/${shopping.dataset.shopping}/shopping-list`, {
        method: "POST", 
        body: JSON.stringify({ servings: state.selectedRecipe.servings || 2 }) 
      });
      await loadPrivatePanels();
      toast("Lista zakupów wygenerowana pomyślnie!");
    } catch (err) {
      toast(err.message);
    }
  }
  
  if (rate) {
    if (!requireLogin()) return;
    try {
      await api(`/recipes/${state.selectedRecipe._id || state.selectedRecipe.id}/rating`, { 
        method: "PUT", 
        body: JSON.stringify({ value: Number(rate.dataset.rate) }) 
      });
      toast("Twoja ocena została zapisana!");
      await openRecipe(state.selectedRecipe.slug);
    } catch (err) {
      toast(err.message);
    }
  }

  // Akcje panelu administratora
  const adminTab = event.target.closest("[data-admin-tab]");
  if (adminTab) {
    state.adminTab = adminTab.dataset.adminTab;
    renderAdminPanel();
  }

  const userRole = event.target.closest("[data-admin-user-role]");
  if (userRole) {
    await api(`/admin/users/${userRole.dataset.adminUserRole}`, {
      method: "PATCH",
      body: JSON.stringify({ role: userRole.dataset.role }),
    });
    await loadAdminPanel();
    toast("Rola uzytkownika zostala zmieniona");
  }

  const userStatus = event.target.closest("[data-admin-user-status]");
  if (userStatus) {
    await api(`/admin/users/${userStatus.dataset.adminUserStatus}`, {
      method: "PATCH",
      body: JSON.stringify({ status: userStatus.dataset.status }),
    });
    await loadAdminPanel();
    toast("Status konta zostal zmieniony");
  }

  const adminComment = event.target.closest("[data-admin-comment]");
  if (adminComment) {
    await api(`/admin/comments/${adminComment.dataset.adminComment}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: adminComment.dataset.status }),
    });
    await loadAdminPanel();
    toast("Komentarz zmoderowany");
  }

  const adminRecipe = event.target.closest("[data-admin-recipe]");
  if (adminRecipe) {
    await api(`/admin/recipes/${adminRecipe.dataset.adminRecipe}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: adminRecipe.dataset.status }),
    });
    await loadAdminPanel();
    await loadRecipes(state.lastParams);
    toast("Status przepisu zostal zmieniony");
  }

  const adminDeleteRecipe = event.target.closest("[data-admin-delete-recipe]");
  if (adminDeleteRecipe) {
    const title = adminDeleteRecipe.dataset.title || "ten przepis";
    if (!confirm(`Usunac przepis "${title}" z aplikacji?`)) return;
    await api(`/admin/recipes/${adminDeleteRecipe.dataset.adminDeleteRecipe}`, { method: "DELETE" });
    await loadAdminPanel();
    await loadRecipes(state.lastParams);
    toast("Przepis zostal usuniety");
  }

  const adminReport = event.target.closest("[data-admin-report]");
  if (adminReport) {
    await api(`/admin/reports/${adminReport.dataset.adminReport}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: adminReport.dataset.status }),
    });
    await loadAdminPanel();
    toast("Status zgloszenia zostal zmieniony");
  }
});

/** Obsługa formularza wyszukiwania przepisów */
$("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const params = new URLSearchParams();
  for (const [key, value] of form.entries()) {
    if (value) params.set(key, value);
  }
  loadRecipes(params).catch((err) => toast(err.message));
});

/** Obsługa formularza dodawania nowego przepisu */
$("#recipeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;

  if (!state.formIngredients || state.formIngredients.length === 0) {
    toast("Musisz dodać co najmniej jeden składnik!");
    $("#ingNameInput").focus();
    return;
  }
  if (!state.formSteps || state.formSteps.length === 0) {
    toast("Musisz dodać co najmniej jeden krok przygotowania!");
    $("#stepInstructionInput").focus();
    return;
  }
  
  const submitBtn = $("#recipeForm button[type='submit']");
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Publikowanie... ⏳";
  }

  try {
    let images = [];
    const imageUrl = $("#newImageUrl").value.trim();
    if (imageUrl) {
      try {
        new URL(imageUrl);
        images.push({
          url: imageUrl,
          alt: $("#newTitle").value.trim() || "Zdjęcie przepisu",
          isMain: true
        });
      } catch (err) {
        toast("Adres URL zdjęcia jest niepoprawny.");
        $("#newImageUrl").focus();
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = "Opublikuj przepis 🍳"; }
        return;
      }
    }

    const nutrition = {
      calories: Number($("#nutCalories").value || 0),
      protein: Number($("#nutProtein").value || 0),
      fat: Number($("#nutFat").value || 0),
      carbs: Number($("#nutCarbs").value || 0),
    };

    const body = {
      title: $("#newTitle").value.trim(),
      description: $("#newDescription").value.trim(),
      categorySlug: $("#newCategory").value,
      ingredients: state.formIngredients,
      steps: state.formSteps,
      tags: listFromInput($("#newTags").value),
      diets: listFromInput($("#newDiets").value),
      prepTimeMinutes: Number($("#prepTime").value || 0),
      cookTimeMinutes: Number($("#cookTime").value || 0),
      servings: Number($("#servings").value || 1),
      difficulty: $("#difficulty").value,
      images: images,
      nutrition: nutrition,
    };

    await api("/recipes", { method: "POST", body: JSON.stringify(body) });
    $("#recipeForm").reset();
    state.formIngredients = [];
    state.formSteps = [];
    renderFormIngredients();
    renderFormSteps();
    toast("Twój przepis został opublikowany!");
    await loadRecipes();
    location.hash = "home";
  } catch (err) {
    toast("Błąd publikacji: " + err.message);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Opublikuj przepis 🍳";
    }
  }
});

/** Obsługa formularza planowania posiłków */
$("#mealForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;
  
  try {
    await api("/me/meal-plans", {
      method: "POST",
      body: JSON.stringify({
        recipeId: $("#mealRecipe").value,
        plannedFor: $("#plannedFor").value,
        mealType: $("#mealType").value,
        servings: Number($("#mealServings").value || 1),
      }),
    });
    await loadPrivatePanels();
    toast("Przepis zaplanowany w kalendarzu!");
  } catch (err) {
    toast("Błąd planowania: " + err.message);
  }
});

/** Obsługa aktualizacji profilu użytkownika */
$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const displayName = $("#profileDisplayName").value;
  const bio = $("#profileBio").value;
  const avatarUrl = $("#profileAvatarUrl").value;
  
  try {
    const data = await api("/users/me", {
      method: "PATCH",
      body: JSON.stringify({ displayName, bio, avatarUrl }),
    });
    
    state.user = data.user;
    localStorage.setItem("user", JSON.stringify(state.user));
    $("#profileDialog").close();
    updateAccount();
    toast("Twój profil został zaktualizowany!");
  } catch (err) {
    $("#profileError").textContent = err.message;
    $("#profileError").classList.remove("hidden");
  }
});

$("#profileTrigger").addEventListener("click", () => {
  if (!state.user) return;
  $("#profileDisplayName").value = state.user.profile?.displayName || state.user.username;
  $("#profileBio").value = state.user.profile?.bio || "";
  $("#profileAvatarUrl").value = state.user.profile?.avatarUrl || "";
  $("#profileError").classList.add("hidden");
  $("#profileDialog").showModal();
});

$("#authButton").addEventListener("click", () => openAuth("login"));
$("#loginTab").addEventListener("click", () => openAuth("login"));
$("#registerTab").addEventListener("click", () => openAuth("register"));
$("#submitAuth").addEventListener("click", submitAuth);

$("#logoutButton").addEventListener("click", () => {
  state.token = null;
  state.user = null;
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  updateAccount();
  loadPrivatePanels();
  $("#adminPanel").innerHTML = "";
  $("#adminStats").innerHTML = "";
  toast("Zostałeś wylogowany.");
});

$("#refreshAdminBtn").addEventListener("click", () => {
  loadAdminPanel().then(() => toast("Panel administratora odswiezony")).catch((err) => toast(err.message));
});

/** Obsługa formularza komentowania */
document.addEventListener("submit", async (event) => {
  if (event.target.id !== "commentForm") return;
  event.preventDefault();
  if (!requireLogin()) return;
  
  const commentInput = $("#commentBody");
  const body = commentInput.value;
  
  try {
    await api(`/recipes/${state.selectedRecipe._id || state.selectedRecipe.id}/comments`, { 
      method: "POST", 
      body: JSON.stringify({ body }) 
    });
    commentInput.value = "";
    toast("Dodano komentarz!");
    await openRecipe(state.selectedRecipe.slug);
  } catch (err) {
    toast(err.message);
  }
});

/**
 * GŁÓWNY ROUTER APLIKACJI (Hash-based Routing).
 * Reaguje na zmiany fragmentu URL (#home, #recipe/slug, itp.).
 */
function handleRoute() {
  const hash = location.hash || "#home";
  
  // Ukrywanie wszystkich sekcji UI
  const sections = ["home", "recipeDetails", "planner", "saved", "shopping", "add", "admin"];
  sections.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add("hidden");
  });
  
  // Zarządzanie widocznością sekcji Hero (tylko na głównej liście)
  const hero = $(".hero");
  if (hero) {
    if (hash === "#home" || hash === "" || hash.startsWith("#search")) {
      hero.classList.remove("hidden");
    } else {
      hero.classList.add("hidden");
    }
  }
  
  // Aktualizacja aktywnego linku w nawigacji
  document.querySelectorAll(".nav a").forEach(link => {
    const href = link.getAttribute("href");
    if (href === hash || (hash === "#home" && href === "#home")) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  // Logika wyświetlania konkretnych sekcji
  if (hash === "#home" || hash === "" || hash.startsWith("#search")) {
    $("#home").classList.remove("hidden");
  } else if (hash === "#planner") {
    $("#planner").classList.remove("hidden");
  } else if (hash === "#saved") {
    $("#saved").classList.remove("hidden");
  } else if (hash === "#shopping") {
    $("#shopping").classList.remove("hidden");
  } else if (hash === "#add") {
    $("#add").classList.remove("hidden");
    state.formIngredients = [];
    state.formSteps = [];
    renderFormIngredients();
    renderFormSteps();
    const form = $("#recipeForm");
    if (form) {
      form.reset();
      $("#prepTime").value = "10"; $("#cookTime").value = "20"; $("#servings").value = "2";
    }
  } else if (hash === "#admin") {
    if (state.user?.role === "admin") {
      $("#admin").classList.remove("hidden");
    } else {
      location.hash = "#home";
    }
  } else if (hash.startsWith("#recipe/")) {
    const slug = hash.replace("#recipe/", "");
    openRecipe(slug).catch(() => { location.hash = "#home"; });
  } else if (hash === "#recipeDetails") {
    $("#recipeDetails").classList.remove("hidden");
  }
  
  window.scrollTo({ top: 0, behavior: "smooth" });
}

window.addEventListener("hashchange", handleRoute);

/**
 * INICJALIZACJA APLIKACJI.
 * Ustawia domyślne wartości, binduje event listenery i wczytuje wstępne dane.
 */
async function init() {
  updateAccount();
  const today = new Date().toISOString().slice(0, 10);
  if ($("#plannedFor")) $("#plannedFor").value = today;

  // Powiązanie przycisków dodawania w formularzu przepisu
  if ($("#addIngBtn")) $("#addIngBtn").addEventListener("click", addIngredientFromForm);
  if ($("#addStepBtn")) $("#addStepBtn").addEventListener("click", addStepFromForm);

  // Obsługa klawisza Enter dla szybkiego wpisywania składników
  const ingInputs = [$("#ingNameInput"), $("#ingQtyInput"), $("#ingUnitInput")];
  ingInputs.forEach(input => {
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); addIngredientFromForm(); }
    });
  });

  $("#stepInstructionInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); addStepFromForm(); }
  });
  
  $("#toggleFiltersBtn")?.addEventListener("click", () => {
    const panel = $("#advancedFilters");
    if (panel) { panel.classList.remove("hidden"); panel.classList.toggle("show"); }
  });

  // --- LOGIKA AUTO-SUGESTII DLA WYSZUKIWANIA ---
  const mainSearchInput = $("#q");
  const mainSearchDropdown = $("#recipeSearchDropdown");

  if (mainSearchInput && mainSearchDropdown) {
    mainSearchInput.addEventListener("focus", async () => {
      const recipes = await getAllRecipes();
      renderMainDropdownItems(recipes);
    });

    mainSearchInput.addEventListener("input", async () => {
      const term = mainSearchInput.value.toLowerCase().trim();
      const recipes = await getAllRecipes();
      if (!term) { renderMainDropdownItems(recipes); return; }
      const filtered = recipes.filter(r =>
        r.title.toLowerCase().includes(term) || (r.description && r.description.toLowerCase().includes(term))
      );
      renderMainDropdownItems(filtered);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".search-input-wrapper")) mainSearchDropdown.classList.add("hidden");
    });

    mainSearchDropdown.addEventListener("click", (e) => {
      const item = e.target.closest(".dropdown-item");
      if (item && !item.classList.contains("empty")) {
        const slug = item.dataset.selectSlug;
        mainSearchInput.value = item.dataset.selectTitle;
        mainSearchDropdown.classList.add("hidden");
        location.hash = `#recipe/${slug}`;
      }
    });
  }

  function renderMainDropdownItems(recipes) {
    if (!recipes.length) {
      mainSearchDropdown.innerHTML = `<div class="dropdown-item empty">Brak przepisów o podanej nazwie</div>`;
      mainSearchDropdown.classList.remove("hidden");
      return;
    }
    mainSearchDropdown.innerHTML = recipes.slice(0, 10).map(recipe => `
      <div class="dropdown-item" data-select-slug="${recipe.slug}" data-select-title="${escapeHtml(recipe.title)}">
        ${recipe.image ? `<img src="${recipe.image}" alt="${escapeHtml(recipe.title)}">` : `<div class="dropdown-img-placeholder">🍳</div>`}
        <div class="dropdown-item-text">
          <strong>${escapeHtml(recipe.title)}</strong>
          <span class="muted">${escapeHtml(recipe.categorySlug || "")} • ⏱ ${recipe.totalTimeMinutes} min</span>
        </div>
      </div>
    `).join("");
    mainSearchDropdown.classList.remove("hidden");
  }

  // Wyszukiwarka w planerze (podobnie jak główna)
  const searchInput = $("#mealRecipeSearch");
  const dropdown = $("#mealRecipeDropdown");
  const hiddenInput = $("#mealRecipe");

  if (searchInput && dropdown && hiddenInput) {
    searchInput.addEventListener("focus", async () => {
      const recipes = await getAllRecipes();
      renderDropdownItems(recipes);
    });

    searchInput.addEventListener("input", async () => {
      const term = searchInput.value.toLowerCase().trim();
      const recipes = await getAllRecipes();
      if (!term) { renderDropdownItems(recipes); hiddenInput.value = ""; return; }
      const filtered = recipes.filter(r => r.title.toLowerCase().includes(term));
      renderDropdownItems(filtered);
    });

    document.addEventListener("click", (e) => {
      if (!e.target.closest(".searchable-select-container")) dropdown.classList.add("hidden");
    });

    dropdown.addEventListener("click", (e) => {
      const item = e.target.closest(".dropdown-item");
      if (item && !item.classList.contains("empty")) {
        searchInput.value = item.dataset.selectTitle;
        hiddenInput.value = item.dataset.selectId;
        dropdown.classList.add("hidden");
      }
    });
  }

  function renderDropdownItems(recipes) {
    if (!recipes.length) {
      dropdown.innerHTML = `<div class="dropdown-item empty">Brak przepisów</div>`;
      dropdown.classList.remove("hidden");
      return;
    }
    dropdown.innerHTML = recipes.slice(0, 10).map(recipe => `
      <div class="dropdown-item" data-select-id="${recipe.id}" data-select-title="${escapeHtml(recipe.title)}">
        ${recipe.image ? `<img src="${recipe.image}" alt="${escapeHtml(recipe.title)}">` : `<div class="dropdown-img-placeholder">🍳</div>`}
        <div class="dropdown-item-text">
          <strong>${escapeHtml(recipe.title)}</strong>
          <span class="muted">${escapeHtml(recipe.categorySlug || "")} • ⏱ ${recipe.totalTimeMinutes} min</span>
        </div>
      </div>
    `).join("");
    dropdown.classList.remove("hidden");
  }

  // Wstępne ładowanie danych
  await loadCategories();
  await loadRecipes();
  await loadPrivatePanels();
  await loadAdminPanel();
  
  handleRoute();
}

// Uruchomienie aplikacji
init().catch((err) => toast(err.message));
