// SPDX-License-Identifier: LGPL-3.0-only
// Copyright (C) 2026 jjm.one
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { calculate, displayName, loadConfig, validateConfig } from "./calc.mjs";

const config = validateConfig(
  JSON.parse(await readFile(new URL("../../public/config.json", import.meta.url))),
);
const custom = validateConfig({
  currency: "EUR",
  beverages: [
    { id: "soda", name: "Soda", price: 2.35, deposit_item_id: "glass" },
    { id: "beer", name: "Beer", price: 4.1, deposit_item_id: "bottle" },
  ],
  deposit_items: [
    { id: "glass", name: "Glass", deposit: 1.25 },
    { id: "bottle", name: "Bottle", deposit: 2.0 },
  ],
});

const order = (menu, drinks = [], returns = []) =>
  calculate(menu, new Map(drinks), new Map(returns));

test("empty order is zero", () => {
  assert.deepEqual(order(config), {
    drinkCount: 0,
    returnCount: 0,
    drinkTotal: 0,
    returnTotal: 0,
    total: 0,
  });
});

test("each drink charges its own price and associated deposit", () => {
  assert.deepEqual(
    order(custom, [
      ["soda", 2],
      ["beer", 1],
    ]),
    {
      drinkCount: 3,
      returnCount: 0,
      drinkTotal: 1330, // 2 × (2.35 + 1.25) + (4.10 + 2.00)
      returnTotal: 0,
      total: 1330,
    },
  );
});

test("returned deposit items subtract their own value", () => {
  assert.deepEqual(
    order(
      custom,
      [
        ["soda", 2],
        ["beer", 1],
      ],
      [
        ["glass", 1],
        ["bottle", 1],
      ],
    ),
    {
      drinkCount: 3,
      returnCount: 2,
      drinkTotal: 1330,
      returnTotal: 325,
      total: 1005,
    },
  );
});

test("multiple returns can create a negative total", () => {
  assert.equal(order(custom, [], [["bottle", 2]]).total, -400);
});

test("sample menu totals drinks and credits correctly", () => {
  assert.equal(
    order(
      config,
      [
        ["1", 1],
        ["2", 1],
      ],
      [["1", 1]],
    ).total,
    950,
  );
});

test("drink and deposit item names come from config and fall back to name", () => {
  const drink = config.beverages[0];
  const depositItem = config.deposit_items[0];
  assert.equal(displayName(drink, "en"), "Longdrink");
  assert.equal(displayName(drink, "de"), "Longdrink"); // No name_de in config.
  assert.equal(displayName(depositItem, "en"), "Glass");
  assert.equal(displayName(depositItem, "de"), "Glas");
  assert.equal(displayName({ name: "Beer", name_de: "Bier" }, "de"), "Bier");
});

test("example menus are valid", async () => {
  for (const name of ["cocktail-bar", "bier-bar"]) {
    validateConfig(
      JSON.parse(await readFile(new URL(`../../examples/${name}.json`, import.meta.url))),
    );
  }
});

test("old keys, missing references, duplicates, and fractional cents are rejected", () => {
  assert.throws(() => validateConfig({ beverages: [], containers: [] }));
  assert.throws(() =>
    validateConfig({
      beverages: [{ id: 1, name: "A", price: 1, container_id: 1 }],
      deposit_items: [{ id: 1, name: "Glass", deposit: 2 }],
    }),
  );
  assert.throws(() =>
    validateConfig({
      beverages: [{ id: 1, name: "A", price: 1, deposit_item_id: 99 }],
      deposit_items: [],
    }),
  );
  assert.throws(() =>
    validateConfig({
      beverages: [],
      deposit_items: [
        { id: 1, name: "A", deposit: 1 },
        { id: "1", name: "B", deposit: 1 },
      ],
    }),
  );
  assert.throws(() =>
    validateConfig({ beverages: [], deposit_items: [{ id: 1, name: "Glass", deposit: 2.001 }] }),
  );
});

test("optional bar name is validated and translated", () => {
  const menu = validateConfig({
    name: "Beer Bar",
    name_de: "Bier-Bar",
    beverages: [],
    deposit_items: [],
  });
  assert.equal(displayName(menu, "en"), "Beer Bar");
  assert.equal(displayName(menu, "de"), "Bier-Bar");
  assert.equal(validateConfig({ beverages: [], deposit_items: [] }).name, undefined);
  assert.throws(() => validateConfig({ name: " ", beverages: [], deposit_items: [] }));
  assert.throws(() => validateConfig({ name: 42, beverages: [], deposit_items: [] }));
  assert.throws(() => validateConfig({ name_de: "Bier-Bar", beverages: [], deposit_items: [] }));
});

const freshResponse = (data) => ({ ok: true, clone: () => ({ json: async () => data }) });
const cachedResponse = (data) => ({ json: async () => data });

test("network failure uses the last valid cached menu", async () => {
  const result = await loadConfig(
    async () => {
      throw new Error("offline");
    },
    async () => cachedResponse(config),
  );
  assert.equal(result.cached, true);
  assert.equal(result.config, config);
});

test("invalid server menu never silently falls back to old prices", async () => {
  let cacheRead = false;
  await assert.rejects(
    loadConfig(
      async () =>
        freshResponse({ beverages: [], deposit_items: [{ id: 1, name: "Glass", deposit: -1 }] }),
      async () => {
        cacheRead = true;
        return cachedResponse(config);
      },
    ),
  );
  assert.equal(cacheRead, false);
});

test("server errors do not silently fall back to old prices", async () => {
  await assert.rejects(
    loadConfig(
      async () => ({ ok: false, status: 404 }),
      async () => cachedResponse(config),
    ),
  );
});

test("valid server menu is preferred over cached data", async () => {
  const response = freshResponse(config);
  const result = await loadConfig(
    async () => response,
    async () => {
      throw new Error("cache should not be read");
    },
  );
  assert.equal(result.cached, false);
  assert.equal(result.response, response);
});
