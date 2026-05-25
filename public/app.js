const state = {
  token: localStorage.getItem("token"),
  user: JSON.parse(localStorage.getItem("user") || "null"),
  recipes: [],
  categories: [],
  selectedRecipe: null,
  shoppingLists: [],
  authMode: "login",
  page: 1,
  pages: 1,
  lastParams: new URLSearchParams(),
};

const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`/api${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Wystąpił błąd");
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
  return { easy: "łatwy", medium: "średni", hard: "trudny" }[value] || value;
}

function formatMeal(value) {
  return { breakfast: "Śniadanie", lunch: "Lunch", dinner: "Obiad", supper: "Kolacja", snack: "Przekąska" }[value] || value;
}

function updateAccount() {
  const isLogged = Boolean(state.user);
  $("#authButton").classList.toggle("hidden", isLogged);
  $("#logoutButton").classList.toggle("hidden", !isLogged);
  $("#userInfo").classList.toggle("hidden", !isLogged);

  if (isLogged) {
    const name = state.user.profile?.displayName || state.user.username;
    $("#userBadge").textContent = name;
    
    const avatarUrl = state.user.profile?.avatarUrl;
    const avatarImg = $("#userAvatar");
    const initials = $("#avatarInitials");
    
    if (avatarUrl && avatarUrl.trim() !== "") {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = "block";
      initials.style.display = "none";
    } else {
      avatarImg.src = "";
      avatarImg.style.display = "none";
      initials.textContent = name.charAt(0).toUpperCase();
      initials.style.display = "grid";
    }
  }
}

async function loadCategories() {
  const data = await api("/categories");
  state.categories = data.items;
  const options = [`<option value="">Wszystkie kategorie</option>`]
    .concat(state.categories.map((item) => `<option value="${item.slug}">${item.name}</option>`))
    .join("");
  $("#category").innerHTML = options;
  $("#newCategory").innerHTML = state.categories.map((item) => `<option value="${item.slug}">${item.name}</option>`).join("");
}

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
}

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

async function openRecipe(slug) {
  if (!slug) return;
  const data = await api(`/recipes/${slug}`);
  state.selectedRecipe = data.recipe;
  const recipe = data.recipe;
  $("#recipeDetails").classList.remove("hidden");
  
  const formattedCategory = state.categories.find(c => c.slug === recipe.categorySlug)?.name || recipe.categorySlug;
  
  $("#recipeDetails").innerHTML = `
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
        <h3>Przygotowanie</h3>
        <ol style="margin-bottom: 32px;">
          ${recipe.steps.map((step) => `<li>${escapeHtml(step.instruction)} <span class="muted">(${step.durationMinutes} min)</span></li>`).join("")}</ol>
        
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
  location.hash = "recipeDetails";
}

function renderRecipeSelect() {
  const options = state.recipes.map((recipe) => `<option value="${recipe.id}">${recipe.title}</option>`).join("");
  $("#mealRecipe").innerHTML = options;
}

// Global functions for inline onclick handlers
window.openRecipeBySlug = (slug) => {
  openRecipe(slug).catch((err) => toast(err.message));
};

window.viewShoppingList = (id) => {
  const list = state.shoppingLists.find(l => (l._id || l.id) === id);
  if (!list) return;
  
  $("#shoppingListName").textContent = list.name;
  
  const updateMeta = () => {
    const checkedCount = list.items.filter(i => i.checked).length;
    $("#shoppingListMeta").textContent = `${checkedCount} z ${list.items.length} zakupionych produktów`;
  };
  updateMeta();

  const renderItems = () => {
    $("#shoppingListItems").innerHTML = list.items.map((item, index) => `
      <div class="shopping-item-row ${item.checked ? 'checked' : ''}" onclick="toggleShoppingItem('${id}', ${index})">
        <input type="checkbox" class="shopping-item-checkbox" ${item.checked ? 'checked' : ''} onclick="event.stopPropagation(); toggleShoppingItem('${id}', ${index})">
        <span class="shopping-item-text">${escapeHtml(item.name)} - <strong>${item.quantity} ${escapeHtml(item.unit)}</strong></span>
      </div>
    `).join("");
  };

  window.toggleShoppingItem = async (listId, itemIndex) => {
    const targetList = state.shoppingLists.find(l => (l._id || l.id) === listId);
    if (!targetList) return;
    
    targetList.items[itemIndex].checked = !targetList.items[itemIndex].checked;
    renderItems();
    updateMeta();

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

  $("#deleteShoppingListBtn").onclick = () => {
    window.deleteShoppingList(id);
  };

  renderItems();
  $("#shoppingListDialog").showModal();
};

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

window.removeFavorite = async (recipeId) => {
  try {
    await api(`/me/favorites/${recipeId}`, { method: "DELETE" });
    await loadPrivatePanels();
    toast("Usunięto z ulubionych");
  } catch (err) {
    toast(err.message);
  }
};

window.deleteMealPlan = async (planId) => {
  try {
    await api(`/me/meal-plans/${planId}`, { method: "DELETE" });
    await loadPrivatePanels();
    toast("Posiłek usunięty z planu");
  } catch (err) {
    toast(err.message);
  }
};

async function loadPrivatePanels() {
  if (!state.user) {
    $("#favoriteList").innerHTML = `<div class="list-item">Zaloguj się, aby zobaczyć ulubione przepisy.</div>`;
    $("#shoppingList").innerHTML = `<div class="list-item">Zaloguj się, aby zobaczyć swoje listy zakupów.</div>`;
    $("#mealList").innerHTML = `<div class="list-item">Zaloguj się, aby zaplanować posiłki.</div>`;
    return;
  }
  const [favorites, lists, plans] = await Promise.all([
    api("/me/favorites"),
    api("/me/shopping-lists"),
    api("/me/meal-plans"),
  ]);
  
  state.shoppingLists = lists.items;

  $("#favoriteList").innerHTML = favorites.items.length
    ? favorites.items.map((item) => `
        <div class="list-item">
          <div class="list-item-content" onclick="openRecipeBySlug('${item.recipeSnapshot.slug}')">
            <div class="list-item-title">${escapeHtml(item.recipeSnapshot.title)}</div>
            <p class="muted">⏱ ${item.recipeSnapshot.totalTimeMinutes} min • ★ ${item.recipeSnapshot.ratingAvg}</p>
          </div>
          <button class="list-item-action-btn" onclick="removeFavorite('${item.recipeId}')" title="Usuń z ulubionych">×</button>
        </div>
      `).join("")
    : `<div class="list-item">Brak zapisanych przepisów. Kliknij gwiazdkę przy przepisie!</div>`;

  $("#shoppingList").innerHTML = lists.items.length
    ? lists.items.map((list) => `
        <div class="list-item">
          <div class="list-item-content" onclick="viewShoppingList('${list._id || list.id}')">
            <div class="list-item-title">🛒 ${escapeHtml(list.name)}</div>
            <p class="muted">${list.items.length} produktów (${list.items.filter(i => i.checked).length} kupionych)</p>
          </div>
          <button class="list-item-action-btn" onclick="deleteShoppingList('${list._id || list.id}')" title="Usuń listę">×</button>
        </div>
      `).join("")
    : `<div class="list-item">Brak list zakupów. Wygeneruj listę z dowolnego przepisu!</div>`;

  $("#mealList").innerHTML = plans.items.length
    ? plans.items.map((plan) => `
        <div class="list-item">
          <div class="list-item-content" onclick="openRecipeBySlug('${plan.recipeSnapshot?.slug}')">
            <div class="list-item-title">📅 ${formatMeal(plan.mealType)} • ${plan.plannedFor}</div>
            <p class="muted">${escapeHtml(plan.recipeSnapshot?.title || "Przepis")}, ${plan.servings} porcji</p>
          </div>
          <button class="list-item-action-btn" onclick="deleteMealPlan('${plan._id || plan.id}')" title="Usuń posiłek">×</button>
        </div>
      `).join("")
    : `<div class="list-item">Brak zaplanowanych posiłków na najbliższe dni.</div>`;
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
  $("#submitAuth").textContent = mode === "login" ? "Zaloguj się" : "Utwórz konto";
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
    toast("Pomyślnie zalogowano!");
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
  const page = event.target.closest("[data-page]");

  if (page) {
    const nextPage = Number(page.dataset.page);
    if (!Number.isFinite(nextPage) || nextPage < 1 || nextPage > state.pages) return;
    const params = new URLSearchParams(state.lastParams);
    params.set("page", String(nextPage));
    await loadRecipes(params);
    location.hash = "home";
  }
  
  if (open) openRecipe(open.dataset.open).catch((err) => toast(err.message));
  
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
  
  try {
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
    toast("Twój przepis został opublikowany!");
    await loadRecipes();
    location.hash = "home";
  } catch (err) {
    toast("Błąd publikacji: " + err.message);
  }
});

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

// User profile form handling
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
  toast("Zostałeś wylogowany.");
});

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

async function init() {
  updateAccount();
  const today = new Date().toISOString().slice(0, 10);
  $("#plannedFor").value = today;
  await loadCategories();
  await loadRecipes();
  await loadPrivatePanels();
}

init().catch((err) => toast(err.message));
