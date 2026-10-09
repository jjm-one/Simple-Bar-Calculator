// SPDX-License-Identifier: LGPL-3.0-only
// Copyright (C) 2026 jjm.one
export const cents = (amount) => Math.round((amount + Number.EPSILON) * 100);
export const displayName = (item, language) =>
  language === "de" && item.name_de ? item.name_de : item.name;

export function validateConfig(config) {
  if (!config || !Array.isArray(config.beverages) || !Array.isArray(config.deposit_items)) {
    throw new Error("Expected beverages and deposit_items arrays.");
  }

  const validName = (value) => typeof value === "string" && value.trim().length > 0;
  const validId = (value) =>
    (typeof value === "string" && value.length > 0) || Number.isSafeInteger(value);
  const validAmount = (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    Number.isSafeInteger(cents(value)) &&
    Math.abs(value * 100 - cents(value)) < 1e-7;
  if (
    (config.name != null && !validName(config.name)) ||
    (config.name_de != null && (config.name == null || !validName(config.name_de)))
  ) {
    throw new Error("Invalid bar name.");
  }
  const ids = new Set();

  for (const item of config.deposit_items) {
    if (
      !validId(item.id) ||
      ids.has(String(item.id)) ||
      !validName(item.name) ||
      (item.name_de != null && !validName(item.name_de)) ||
      !validAmount(item.deposit)
    ) {
      throw new Error("Invalid deposit item.");
    }
    ids.add(String(item.id));
  }

  const beverageIds = new Set();
  for (const beverage of config.beverages) {
    if (
      !validId(beverage.id) ||
      beverageIds.has(String(beverage.id)) ||
      !validName(beverage.name) ||
      (beverage.name_de != null && !validName(beverage.name_de)) ||
      !validAmount(beverage.price) ||
      !ids.has(String(beverage.deposit_item_id))
    ) {
      throw new Error("Invalid beverage or deposit_item_id.");
    }
    beverageIds.add(String(beverage.id));
  }

  if (
    config.currency != null &&
    (typeof config.currency !== "string" || !/^[A-Z]{3}$/.test(config.currency))
  ) {
    throw new Error("Invalid currency code.");
  }
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: config.currency || "EUR" });
  } catch {
    throw new Error("Invalid currency code.");
  }
  return config;
}

export async function loadConfig(fetchFresh, readCached) {
  let response;
  try {
    response = await fetchFresh();
  } catch {
    const cached = await readCached();
    if (!cached) throw new Error("No cached configuration.");
    return { config: validateConfig(await cached.json()), cached: true };
  }
  if (!response.ok) throw new Error("Configuration request failed.");
  return { config: validateConfig(await response.clone().json()), cached: false, response };
}

export function calculate(config, beverages, returns) {
  const depositById = new Map(
    config.deposit_items.map((item) => [String(item.id), cents(item.deposit)]),
  );
  const drinkCount = [...beverages.values()].reduce((sum, count) => sum + count, 0);
  const returnCount = [...returns.values()].reduce((sum, count) => sum + count, 0);
  const drinkTotal = config.beverages.reduce(
    (sum, drink) =>
      sum +
      (beverages.get(String(drink.id)) || 0) *
        (cents(drink.price) + depositById.get(String(drink.deposit_item_id))),
    0,
  );
  const returnTotal = config.deposit_items.reduce(
    (sum, item) => sum + (returns.get(String(item.id)) || 0) * cents(item.deposit),
    0,
  );
  return { drinkCount, returnCount, drinkTotal, returnTotal, total: drinkTotal - returnTotal };
}
