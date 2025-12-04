const API_BASE = window.WEBAPP_API ?? "http://127.0.0.1:8000";
const query = new URLSearchParams(window.location.search);
const urlPlayerId = Number(query.get("id"));
const PLAYER_ID = Number.isFinite(urlPlayerId) && urlPlayerId > 0 ? urlPlayerId : Number(window.PLAYER_ID ?? 2033598660);

const LS_THEME_KEY = "transcity-hud-theme";
const LS_MUSIC_KEY = "transcity-hud-music";
const LS_WELCOME_KEY = "transcity-hud-welcome";

const CATEGORY_LABELS = {
  starter: "🚦 Старты",
  city: "🏙️ Службы",
  hi_tech: "🛠️ Технопарк",
  science: "🧪 Лаборатория",
  entertainment: "🎭 Медиа",
  shadow: "🌘 Теневая сеть",
  special: "✨ Секреты",
};

const fallbackState = {
  player: {
    name: "Гость",
    job: "Загрузка профиля...",
    level: 8,
    wallet: 32417,
    bank: 61500,
    debt: 2800,
    mood: "База готовится к празднику",
    motto: "Проверяйте дебет перед салютом.",
  },
  status: {
    tax_balance: 460,
    tax_note: "Оплатите в течение 06:00",
    bank_note: "+5% / сутки при активном вкладе",
    debt_note: "Просрочка не зафиксирована",
    city_mood: "В ожидании гостей",
    city_note: "Аукцион неактивен.",
  },
  businesses: [
    {
      name: "☄️ Неоновый реактор",
      category: "hi_tech",
      income: 1240,
      level: 3,
      ready_in: 0,
      tag: "Готов к сбору",
    },
    {
      name: "🛰️ Оса спутниковая",
      category: "shadow",
      income: 760,
      level: 1,
      ready_in: 1800,
      tag: "Повторная выдача через 30 мин",
    },
  ],
  estates: [
    { name: "🏡 Тёплый домик", rent: 420, ready_in: 0, note: "Щит до рассвета" },
    { name: "🏢 Пентхаус Aurora", rent: 600, ready_in: 900, note: "Аренда заблокирована" },
  ],
  events: [
    { title: "🎄 Заледеневший парк", note: "Горожане копят ресурсы для ярмарки.", timer: "00:40" },
    { title: "🎆 Мэрия готовит салют", note: "Город получит +5% дохода за смену.", timer: "01:20" },
  ],
  timeline: [
    { title: "Налоги", text: "Проверяйте накопленные долги каждые 30 минут." },
    { title: "Аукцион", text: "Лоты обновляются по расписанию мэра." },
    { title: "Город", text: "События влияют на доходы и штрафы." },
  ],
};

const deepClone = (value) =>
  typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));

let appState = deepClone(fallbackState);

const $ = (selector) => document.querySelector(selector);

const formatMoney = (value = 0) => `${Number(value ?? 0).toLocaleString("ru-RU")}$`;

const formatTimer = (seconds = 0) => {
  const sec = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(sec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
};

function renderHero() {
  $("#playerName").textContent = appState.player?.name ?? "Игрок";
  $("#playerJob").textContent = appState.player?.job || "Профиль синхронизируется";
  $("#playerLevel").textContent = appState.player?.level ?? "—";
  $("#heroMood").textContent = appState.player?.mood || "Город дремлет и ждёт салютов";
  $("#heroMotto").textContent =
    appState.player?.motto || "Соберите доход и оплатите налоги до боя курантов.";
}

function renderBadges() {
  const items = [
    { label: "Кошелёк", value: formatMoney(appState.player?.wallet) },
    { label: "Банк", value: formatMoney(appState.player?.bank) },
    { label: "Долги", value: formatMoney(appState.player?.debt) },
    { label: "Налоги", value: formatMoney(appState.status?.tax_balance) },
  ];
  const wrapper = $("#statBadges");
  wrapper.innerHTML = "";
  items.forEach((item) => {
    const div = document.createElement("div");
    div.className = "stat-chip";
    div.innerHTML = `<span>${item.label}</span><strong>${item.value}</strong>`;
    wrapper.appendChild(div);
  });
}

function renderStatusCards() {
  $("#taxAmount").textContent = formatMoney(appState.status?.tax_balance);
  $("#taxNote").textContent = appState.status?.tax_note || "Налоговых уведомлений нет.";
  $("#bankAmount").textContent = formatMoney(appState.player?.bank);
  $("#bankNote").textContent = appState.status?.bank_note || "+5% при активном вкладе.";
  $("#debtAmount").textContent = formatMoney(appState.player?.debt);
  $("#debtNote").textContent = appState.status?.debt_note || "Просрочек нет.";
  $("#cityMood").textContent = appState.status?.city_mood || "Город отдыхает";
  $("#cityNote").textContent = appState.status?.city_note || "События отсутствуют.";
}

function renderList(containerId, items, emptyText) {
  const container = $(containerId);
  container.innerHTML = "";
  if (!items?.length) {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<div><p class="list-item__title">${emptyText}</p></div>`;
    container.appendChild(row);
    return;
  }
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "list-item";
    row.innerHTML = `<div>
        <p class="list-item__title">${item.name}</p>
        <p class="list-item__meta">${item.meta ?? ""}</p>
      </div>
      <div class="list-item__meta">${item.note ?? ""}</div>`;
    container.appendChild(row);
  });
}

function renderBusinesses() {
  const list = (appState.businesses || []).map((biz) => {
    const label = CATEGORY_LABELS[biz.category] || "📦 Портфель";
    const status = biz.ready_in > 0 ? `⏳ ${formatTimer(biz.ready_in)}` : "✅ Готово";
    return {
      name: `${biz.name} · ур. ${biz.level ?? 0}`,
      meta: `${label} · +${formatMoney(biz.income)}/цикл`,
      note: biz.tag || status,
    };
  });
  renderList("#businessList", list, "Нет активных бизнесов. Соберите портфель в Telegram.");
}

function renderEstates() {
  const list = (appState.estates || []).map((estate) => {
    const status = estate.ready_in > 0 ? `⏳ ${formatTimer(estate.ready_in)}` : "✅ Сдать можно";
    return {
      name: estate.name,
      meta: `Аренда +${formatMoney(estate.rent)} · ${status}`,
      note: estate.note || "",
    };
  });
  renderList("#estateList", list, "Недвижимость не куплена.");
}

function renderEvents() {
  const container = $("#eventsList");
  container.innerHTML = "";
  const events = appState.events ?? [];
  if (!events.length) {
    const li = document.createElement("li");
    li.textContent = "Сейчас спокойно. Следите за анонсами мэра.";
    container.appendChild(li);
    return;
  }
  events.forEach((event) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${event.title}</strong>
      <p>${event.note ?? ""}</p>
      <small>${event.timer ? `⏳ ${event.timer}` : ""}</small>`;
    container.appendChild(li);
  });
}

function renderTimeline() {
  const container = $("#timelineList");
  container.innerHTML = "";
  (appState.timeline || []).forEach((item) => {
    const li = document.createElement("li");
    li.innerHTML = `<strong>${item.title}</strong><p>${item.text}</p>`;
    container.appendChild(li);
  });
  if (!container.children.length) {
    const li = document.createElement("li");
    li.textContent = "Сбор данных ещё не проводился.";
    container.appendChild(li);
  }
}

function setUpdatedLabel(manual = false) {
  const label = $("#lastUpdated");
  const dt = new Date();
  label.textContent = `${dt.toLocaleDateString("ru-RU")} ${dt
    .toLocaleTimeString("ru-RU")
    .replace(/:\d{2}$/, "")}${manual ? " · ручной запрос" : ""}`;
}

function renderAll(manual = false) {
  renderHero();
  renderBadges();
  renderStatusCards();
  renderBusinesses();
  renderEstates();
  renderEvents();
  renderTimeline();
  setUpdatedLabel(manual);
}

function toggleLoader(state) {
  $("#loader").classList.toggle("is-hidden", !state);
}

async function loadState(manual = false) {
  toggleLoader(true);
  try {
    const response = await fetch(`${API_BASE}/api/state/${PLAYER_ID}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }
    const payload = await response.json();
    appState = payload;
    renderAll(manual);
  } catch (error) {
    console.warn("[Web HUD] fallback", error);
    appState = deepClone(fallbackState);
    $("#cityNote").textContent = "API недоступен. Показаны демонстрационные данные.";
    renderAll(false);
  } finally {
    toggleLoader(false);
  }
}

function applyTheme(theme) {
  document.body.classList.remove("theme-warm", "theme-cool");
  const target = theme === "cool" ? "theme-cool" : "theme-warm";
  document.body.classList.add(target);
  localStorage.setItem(LS_THEME_KEY, target);
  $("#themeToggle").textContent = target === "theme-warm" ? "Сменить тему (снег)" : "Сменить тему (камин)";
  $("#themeToggle").classList.toggle("is-active", target === "theme-cool");
}

function setupTheme() {
  const stored = localStorage.getItem(LS_THEME_KEY) || "theme-warm";
  applyTheme(stored === "theme-cool" ? "cool" : "warm");
  $("#themeToggle").addEventListener("click", () => {
    const next = document.body.classList.contains("theme-warm") ? "cool" : "warm";
    applyTheme(next);
  });
}

function updateMusicButton() {
  const enabled = localStorage.getItem(LS_MUSIC_KEY) === "on";
  const button = $("#musicToggle");
  button.textContent = enabled ? "Музыка играет" : "Включить музыку";
  button.classList.toggle("is-active", enabled);
}

async function toggleMusic(forcePlay = false) {
  const audio = $("#holidayAudio");
  const enabled = localStorage.getItem(LS_MUSIC_KEY) === "on";
  if (!enabled || forcePlay) {
    try {
      await audio.play();
      localStorage.setItem(LS_MUSIC_KEY, "on");
    } catch (err) {
      console.warn("Audio autoplay blocked", err);
    }
  } else {
    audio.pause();
    audio.currentTime = 0;
    localStorage.setItem(LS_MUSIC_KEY, "off");
  }
  updateMusicButton();
}

function setupMusic() {
  updateMusicButton();
  $("#musicToggle").addEventListener("click", () => toggleMusic(false));
  if (localStorage.getItem(LS_MUSIC_KEY) === "on") {
    toggleMusic(true);
  }
}

function setupWelcomeModal() {
  const modal = $("#welcomeModal");
  const closeBtn = $("#closeWelcome");
  const seen = localStorage.getItem(LS_WELCOME_KEY) === "seen";
  if (seen) {
    modal.classList.add("is-hidden");
    return;
  }
  closeBtn.addEventListener("click", () => {
    modal.classList.add("is-hidden");
    localStorage.setItem(LS_WELCOME_KEY, "seen");
    toggleMusic(true);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  renderAll(false);
  setupTheme();
  setupMusic();
  setupWelcomeModal();
  loadState(false);
  $("#refreshButton").addEventListener("click", () => loadState(true));
});
