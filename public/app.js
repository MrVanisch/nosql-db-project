const state = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
  recipes: [],
  categories: [],
  selectedRecipe: null,
  authMode: "login",
};

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Wystapil blad");
  }
  return data;
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.remove("hidden");
  setTimeout(() => node.classList.add("hidden"), 3200);
}

function formatDifficulty(value) {
  return { easy: "latwy", medium: "sredni", hard: "trudny" }[value] || value;
}

function formatMeal(value) {
  return { breakfast: "Sniadanie", lunch: "Lunch", dinner: "Obiad", supper: "Kolacja", snack: "Przekaska" }[value] || value;
}

function updateAccount() {
  $("#userBadge").textContent = state.user ? state.user.profile?.displayName || state.user.username : "Gosc";
  $("#authButton").classList.toggle("hidden", Boolean(state.user));
  $("#logoutButton").classList.toggle("hidden", !state.user);
}

async function loadCategories() {
  const data = await api("/categories");
  state.categories = data.items;
  const options = [`<option value="">Wszystkie</option>`]
    .concat(state.categories.map((item) => `<option value="${item.slug}">${item.name}</option>`))
    .join("");
  $("#category").innerHTML = options;
  $("#newCategory").innerHTML = state.categories.map((item) => `<option value="${item.slug}">${item.name}</option>`).join("");
}

async function loadRecipes(params = new URLSearchParams()) {
  params.set("limit", "24");
  const data = await api(`/recipes?${params.toString()}`);
  state.recipes = data.items;
  $("#resultCount").textContent = `${data.total} wynikow`;
  renderRecipes();
  renderRecipeSelect();
}

function renderRecipes() {
  const grid = $("#recipeGrid");
  if (!state.recipes.length) {
    grid.innerHTML = `<div class="list-item">Brak przepisow dla wybranych filtrow.</div>`;
    return;
  }
  grid.innerHTML = state.recipes.map((recipe) => `
    <article class="recipe-card">
      <img src="${recipe.image}" alt="${escapeHtml(recipe.title)}" loading="lazy">
      <div class="recipe-body">
        <div class="meta">
          <span>${recipe.totalTimeMinutes} min</span>
          <span>•</span>
          <span>${formatDifficulty(recipe.difficulty)}</span>
          <span>•</span>
          <span>${recipe.ratingAvg.toFixed ? recipe.ratingAvg.toFixed(1) : recipe.ratingAvg} ★</span>
        </div>
        <h3>${escapeHtml(recipe.title)}</h3>
        <p class="muted">${escapeHtml(recipe.description)}</p>
        <div class="chip-row">${recipe.tags.slice(0, 3).map((tag) => `<span class="chip">${tag}</span>`).join("")}</div>
        <div class="actions">
          <button class="btn small primary" data-open="${recipe.slug}">Szczegoly</button>
          <button class="btn small secondary" data-favorite="${recipe.id}">Zapisz</button>
        </div>
      </div>
    </article>
  `).join("");
}

async function openRecipe(slug) {
  const data = await api(`/recipes/${slug}`);
  state.selectedRecipe = data.recipe;
  const recipe = data.recipe;
  $("#recipeDetails").classList.remove("hidden");
  $("#recipeDetails").innerHTML = `
    <div class="detail-layout">
      <div>
        <img class="detail-media" src="${recipe.images?.[0]?.url || ""}" alt="${escapeHtml(recipe.title)}">
        <p class="eyebrow">${recipe.categorySlug}</p>
        <h2>${escapeHtml(recipe.title)}</h2>
        <p class="muted">${escapeHtml(recipe.description)}</p>
        <div class="chip-row">${(recipe.tags || []).map((tag) => `<span class="chip">${tag}</span>`).join("")}</div>
        <h3>Skladniki</h3>
        <ul>${recipe.ingredients.map((item) => `<li>${escapeHtml(item.name)}: ${item.quantity} ${escapeHtml(item.unit)}</li>`).join("")}</ul>
        <h3>Przygotowanie</h3>
        <ol>${recipe.steps.map((step) => `<li>${escapeHtml(step.instruction)} <span class="muted">(${step.durationMinutes} min)</span></li>`).join("")}</ol>
        <h3>Komentarze</h3>
        <div id="comments">${data.comments.map((comment) => `<div class="list-item"><strong>${escapeHtml(comment.userSnapshot.displayName)}</strong><p>${escapeHtml(comment.body)}</p></div>`).join("") || "<p class='muted'>Brak komentarzy.</p>"}</div>
        <form id="commentForm" class="stack">
          <textarea id="commentBody" placeholder="Dodaj komentarz"></textarea>
          <button class="btn primary" type="submit">Dodaj komentarz</button>
        </form>
      </div>
      <aside class="facts">
        <div class="fact"><span>Ocena</span><strong>${recipe.ratingAvg || 0} / 5</strong></div>
        <div class="fact"><span>Porcje</span><strong>${recipe.servings}</strong></div>
        <div class="fact"><span>Czas</span><strong>${recipe.totalTimeMinutes} min</strong></div>
        <div class="fact"><span>Kalorie</span><strong>${recipe.nutrition?.calories || 0} kcal</strong></div>
        <button class="btn primary" data-shopping="${recipe._id || recipe.id}">Lista zakupow</button>
        <div class="actions">
          ${[1,2,3,4,5].map((value) => `<button class="icon-btn" data-rate="${value}" title="Ocena ${value}">${value}</button>`).join("")}
        </div>
      </aside>
    </div>
  `;
  location.hash = "recipeDetails";
}

function renderRecipeSelect() {
  const options = state.recipes.map((recipe) => `<option value="${recipe.id}">${recipe.title}</option>`).join("");
  $("#mealRecipe").innerHTML = options;
}

async function loadPrivatePanels() {
  if (!state.user) {
    $("#favoriteList").innerHTML = `<div class="list-item">Zaloguj sie, aby zobaczyc ulubione.</div>`;
    $("#shoppingList").innerHTML = "";
    $("#mealList").innerHTML = `<div class="list-item">Zaloguj sie, aby planowac posilki.</div>`;
    return;
  }
  const [favorites, lists, plans] = await Promise.all([
    api("/me/favorites"),
    api("/me/shopping-lists"),
    api("/me/meal-plans"),
  ]);
  $("#favoriteList").innerHTML = favorites.items.length
    ? favorites.items.map((item) => `<div class="list-item"><strong>${escapeHtml(item.recipeSnapshot.title)}</strong><p class="muted">${item.recipeSnapshot.totalTimeMinutes} min • ${item.recipeSnapshot.ratingAvg} ★</p></div>`).join("")
    : `<div class="list-item">Brak zapisanych przepisow.</div>`;
  $("#shoppingList").innerHTML = lists.items.length
    ? lists.items.map((list) => `<div class="list-item"><strong>${escapeHtml(list.name)}</strong><p class="muted">${list.items.length} produktow</p></div>`).join("")
    : `<div class="list-item">Brak list zakupow.</div>`;
  $("#mealList").innerHTML = plans.items.length
    ? plans.items.map((plan) => `<div class="list-item"><strong>${formatMeal(plan.mealType)} • ${plan.plannedFor}</strong><p>${escapeHtml(plan.recipeSnapshot?.title || "Przepis")}, ${plan.servings} porcje</p></div>`).join("")
    : `<div class="list-item">Plan jest pusty.</div>`;
}

function parseIngredients(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((line) => {
    const [name, quantity, unit] = line.split("|").map((part) => part.trim());
    return { name, quantity: Number(quantity || 1), unit: unit || "szt" };
  });
}

function parseSteps(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean).map((instruction, index) => ({
    order: index + 1,
    instruction,
    durationMinutes: 5,
  }));
}

function listFromInput(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function openAuth(mode = "login") {
  state.authMode = mode;
  $("#loginTab").classList.toggle("active", mode === "login");
  $("#registerTab").classList.toggle("active", mode === "register");
  document.querySelectorAll(".register-only").forEach((node) => node.classList.toggle("hidden", mode !== "register"));
  $("#submitAuth").textContent = mode === "login" ? "Zaloguj" : "Utworz konto";
  $("#authError").classList.add("hidden");
  $("#authDialog").showModal();
}

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
    toast("Zalogowano");
  } catch (err) {
    $("#authError").textContent = err.message;
    $("#authError").classList.remove("hidden");
  }
}

function requireLogin() {
  if (!state.user) {
    openAuth("login");
    return false;
  }
  return true;
}

document.addEventListener("click", async (event) => {
  const open = event.target.closest("[data-open]");
  const favorite = event.target.closest("[data-favorite]");
  const shopping = event.target.closest("[data-shopping]");
  const rate = event.target.closest("[data-rate]");
  if (open) openRecipe(open.dataset.open).catch((err) => toast(err.message));
  if (favorite) {
    if (!requireLogin()) return;
    await api(`/me/favorites/${favorite.dataset.favorite}`, { method: "POST" });
    await loadPrivatePanels();
    toast("Przepis zapisany");
  }
  if (shopping) {
    if (!requireLogin()) return;
    await api(`/recipes/${shopping.dataset.shopping}/shopping-list`, { method: "POST", body: JSON.stringify({ servings: state.selectedRecipe.servings || 2 }) });
    await loadPrivatePanels();
    toast("Lista zakupow utworzona");
  }
  if (rate) {
    if (!requireLogin()) return;
    await api(`/recipes/${state.selectedRecipe._id || state.selectedRecipe.id}/rating`, { method: "PUT", body: JSON.stringify({ value: Number(rate.dataset.rate) }) });
    toast("Ocena zapisana");
    await openRecipe(state.selectedRecipe.slug);
  }
});

$("#searchForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const params = new URLSearchParams();
  for (const [key, value] of form.entries()) {
    if (value) params.set(key, value);
  }
  loadRecipes(params).catch((err) => toast(err.message));
});

$("#recipeForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;
  const body = {
    title: $("#newTitle").value,
    description: $("#newDescription").value,
    categorySlug: $("#newCategory").value,
    ingredients: parseIngredients($("#newIngredients").value),
    steps: parseSteps($("#newSteps").value),
    tags: listFromInput($("#newTags").value),
    diets: listFromInput($("#newDiets").value),
    prepTimeMinutes: Number($("#prepTime").value || 0),
    cookTimeMinutes: Number($("#cookTime").value || 0),
    servings: Number($("#servings").value || 1),
    difficulty: $("#difficulty").value,
  };
  await api("/recipes", { method: "POST", body: JSON.stringify(body) });
  event.currentTarget.reset();
  toast("Przepis opublikowany");
  await loadRecipes();
});

$("#mealForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!requireLogin()) return;
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
  toast("Dodano do planu");
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
  toast("Wylogowano");
});

document.addEventListener("submit", async (event) => {
  if (event.target.id !== "commentForm") return;
  event.preventDefault();
  if (!requireLogin()) return;
  const body = $("#commentBody").value;
  await api(`/recipes/${state.selectedRecipe._id || state.selectedRecipe.id}/comments`, { method: "POST", body: JSON.stringify({ body }) });
  toast("Komentarz dodany");
  await openRecipe(state.selectedRecipe.slug);
});

async function init() {
  updateAccount();
  const today = new Date().toISOString().slice(0, 10);
  $("#plannedFor").value = today;
  await loadCategories();
  await loadRecipes();
  await loadPrivatePanels();
}

init().catch((err) => toast(err.message));
