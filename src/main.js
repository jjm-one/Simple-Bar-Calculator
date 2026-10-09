// SPDX-License-Identifier: LGPL-3.0-only
// Copyright (C) 2026 jjm.one
import { translations } from "./i18n/translations.js";
import { cents, displayName, loadConfig, calculate } from "./lib/calc.mjs";

const $ = (selector) => document.querySelector(selector);
const CONFIG_CACHE = "bar-calculator-config";
const LANGUAGE_KEY = "bar-calculator-language";
const UNDO_MS = 5000;
let savedLanguage;
try {
  savedLanguage = localStorage.getItem(LANGUAGE_KEY);
} catch {
  /* Storage may be disabled. */
}
let language =
  savedLanguage === "en" || savedLanguage === "de"
    ? savedLanguage
    : navigator.language?.toLowerCase().startsWith("de")
      ? "de"
      : "en";
const t = (key) => translations[language][key];
const state = {
  config: null,
  beverages: new Map(),
  returns: new Map(),
  configError: false,
  serverUnreachable: false, // Last request failed, or the menu came from the offline cache.
};
let formatter;
let undo = null; // Snapshot of a cleared order while "Undo" is offered.
let wakeLock = null;
const money = (amount) => formatter.format(amount / 100);
const countText = (n) => `${n} ${t(n === 1 ? "item" : "items")}`;

function element(tag, className, text) {
  const el = document.createElement(tag);
  el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function makeItem(item, type) {
  const isBeverage = type === "beverage";
  const map = isBeverage ? state.beverages : state.returns;
  const id = String(item.id);
  const name = displayName(item, language);
  const detail = isBeverage
    ? `${money(cents(item.price))} + ${money(cents(state.config.deposit_items.find((depositItem) => String(depositItem.id) === String(item.deposit_item_id)).deposit))} ${t("deposit")}`
    : `${money(cents(item.deposit))} ${t("creditEach")}`;
  const label = isBeverage ? name : `${name} ${t("returned")}`;
  const current = map.get(id) || 0;

  const info = element("div", "item-info");
  info.append(element("div", "item-name", name), element("div", "item-detail", detail));
  const minus = element("button", "step", "−");
  const quantity = element("span", "quantity", String(current));
  const plus = element("button", "step plus", "+");
  minus.type = plus.type = "button";
  minus.setAttribute("aria-label", `${t("remove")} ${label}`);
  plus.setAttribute("aria-label", `${t("add")} ${label}`);
  quantity.setAttribute("aria-label", t("quantity"));
  minus.disabled = current === 0;

  const change = (delta) => {
    const next = Math.max(0, (map.get(id) || 0) + delta);
    if (next) map.set(id, next);
    else map.delete(id);
    quantity.textContent = String(next);
    minus.disabled = next === 0;
    row.classList.toggle("selected", next > 0);
    endUndo();
    updateTotal();
  };
  minus.addEventListener("click", () => change(-1));
  plus.addEventListener("click", () => change(1));

  const controls = element("div", "quantity-controls");
  controls.append(minus, quantity, plus);
  const row = element("div", current ? "item selected" : "item");
  row.append(info, controls);
  return row;
}

function render() {
  updateTitle();
  formatter = new Intl.NumberFormat(language === "de" ? "de-DE" : "en-GB", {
    style: "currency",
    currency: state.config.currency || "EUR",
  });
  const drinks = state.config.beverages.map((item) => makeItem(item, "beverage"));
  const returns = state.config.deposit_items.map((item) => makeItem(item, "deposit_item"));
  $("#beverages").replaceChildren(
    ...(drinks.length ? drinks : [element("div", "empty", t("noDrinks"))]),
  );
  $("#deposit-items").replaceChildren(
    ...(returns.length ? returns : [element("div", "empty", t("noDepositItems"))]),
  );
  updateTotal();
}

function updateTotal() {
  const { drinkCount, returnCount, drinkTotal, returnTotal, total } = calculate(
    state.config,
    state.beverages,
    state.returns,
  );
  $("#drink-count").textContent = countText(drinkCount);
  $("#return-count").textContent = countText(returnCount);
  $("#drinks-subtotal").textContent = money(drinkTotal);
  $("#returns-subtotal").textContent = `−${money(returnTotal)}`;
  $("#total").textContent = money(total);
  const clear = $("#clear");
  clear.textContent = t(undo ? "undo" : "clear");
  clear.classList.toggle("undo", Boolean(undo));
  clear.disabled = !undo && drinkCount + returnCount === 0;
}

function endUndo() {
  if (!undo) return;
  clearTimeout(undo.timer);
  undo = null;
}

function clearOrUndo() {
  if (undo) {
    ({ beverages: state.beverages, returns: state.returns } = undo);
    endUndo();
  } else {
    undo = {
      beverages: state.beverages,
      returns: state.returns,
      timer: setTimeout(() => {
        undo = null;
        updateTotal();
      }, UNDO_MS),
    };
    state.beverages = new Map();
    state.returns = new Map();
  }
  render();
}

function updateTitle() {
  const barName = state.config?.name ? displayName(state.config, language) : "";
  $("#bar-name").textContent = barName || t("title");
  // Keep the app name visible below a configured bar name.
  $("#app-name").hidden = !barName;
  document.title = barName ? `${barName} · ${t("title")}` : t("title");
}

function updateConnection() {
  const offline = state.serverUnreachable || !navigator.onLine;
  const status = state.configError
    ? "unavailable"
    : !state.config
      ? "loading"
      : offline
        ? "offline"
        : "online";
  const connection = $("#connection");
  connection.textContent = t(status);
  connection.classList.toggle("offline", offline);
  connection.classList.toggle("error", state.configError);
}

function setLanguage(next) {
  language = next;
  document.documentElement.lang = next;
  updateTitle();
  $(".checkout").setAttribute("aria-label", t("orderTotal"));
  $(".language").setAttribute("aria-label", t("language"));
  document
    .querySelectorAll(".language-button")
    .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.lang === next)));
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  updateConnection();
  if (state.configError) $("#config-error").textContent = t("configError");
  if (state.config) render();
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    /* Storage may be disabled. */
  }
}

const fetchMenu = () => fetch("./config.json", { cache: "no-store" });
const readCachedMenu = async () =>
  "caches" in window && (await (await caches.open(CONFIG_CACHE)).match("./config.json"));
const saveMenu = (response) => {
  if ("caches" in window)
    caches
      .open(CONFIG_CACHE)
      .then((cache) => cache.put("./config.json", response))
      .catch(() => {});
};

function applyMenu(config, cached) {
  // Drop quantities of items that a newer menu no longer contains.
  for (const [map, items] of [
    [state.beverages, config.beverages],
    [state.returns, config.deposit_items],
  ]) {
    const ids = new Set(items.map((item) => String(item.id)));
    for (const id of map.keys()) if (!ids.has(id)) map.delete(id);
  }
  endUndo();
  state.config = config;
  state.serverUnreachable = cached;
  render();
  updateConnection();
}

async function load() {
  try {
    const { config, cached, response } = await loadConfig(fetchMenu, readCachedMenu);
    applyMenu(config, cached);
    if (!cached) saveMenu(response);
  } catch {
    state.configError = true;
    $("#config-error").textContent = t("configError");
    $("#config-error").hidden = false;
    updateConnection();
  }
}

// Re-check the server when the app returns to the foreground, after back/forward navigation or
// when the network returns: show whether it is reachable and pick up a changed menu.
// Unlike the first load, failures keep the current menu so an order in progress is never lost.
async function syncMenu() {
  if (!state.config) return;
  let response;
  try {
    response = await fetchMenu();
  } catch {
    response = null;
  }
  state.serverUnreachable = !response?.ok;
  updateConnection();
  if (state.serverUnreachable) return;
  try {
    const { config } = await loadConfig(
      async () => response,
      async () => null,
    );
    applyMenu(config, false);
    saveMenu(response);
  } catch {
    /* Invalid menu on the server: keep the current one. */
  }
}

// Keep the screen on while the calculator is visible; browsers release the lock when it is hidden.
async function keepScreenOn() {
  if (wakeLock || !("wakeLock" in navigator) || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    /* Not allowed, e.g. in battery saver mode. */
  }
}

document
  .querySelectorAll(".language-button")
  .forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.lang)));
$("#clear").addEventListener("click", clearOrUndo);
window.addEventListener("online", () => {
  updateConnection();
  syncMenu();
});
window.addEventListener("offline", updateConnection);
document.addEventListener("visibilitychange", () => {
  keepScreenOn();
  if (document.visibilityState === "visible") syncMenu();
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted) syncMenu();
});
document.addEventListener("click", keepScreenOn);
setLanguage(language);
load();
keepScreenOn();
if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("./sw.js").catch(() => {}),
  );
