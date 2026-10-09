// SPDX-License-Identifier: LGPL-3.0-only
// Copyright (C) 2026 jjm.one
// Browser tests against the production build in headless Chrome (DevTools protocol, no dependencies).
// Chrome is taken from CHROME_PATH or a standard install; without it the tests are skipped, except in CI.
import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { build } from "../scripts/build.mjs";

const chromePath = [
  process.env.CHROME_PATH,
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
].find((path) => path && existsSync(path));
if (!chromePath && process.env.CI)
  throw new Error("Chrome is required for UI tests in CI; set CHROME_PATH.");
const skip = chromePath ? false : "Chrome not found; set CHROME_PATH to run UI tests.";

// 4 drinks and 2 deposit items: the amount that must fit on a phone without scrolling.
const MENU = {
  name: "Cocktail Bar",
  name_de: "Cocktail-Bar",
  currency: "EUR",
  beverages: [
    { id: "cocktail", name: "Cocktail", price: 4, deposit_item_id: "cup" },
    { id: "longdrink", name: "Longdrink", price: 3, deposit_item_id: "cup" },
    {
      id: "virgin",
      name: "Cocktail (alcohol-free)",
      name_de: "Cocktail ALK-FREI",
      price: 2,
      deposit_item_id: "cup",
    },
    { id: "beer", name: "Beer", name_de: "Bier", price: 3.5, deposit_item_id: "bottle" },
  ],
  deposit_items: [
    { id: "cup", name: "Cup", name_de: "Becher", deposit: 2 },
    { id: "bottle", name: "Bottle", name_de: "Flasche", deposit: 2 },
  ],
};
// Visible browser area with toolbars: iPhone 12 in Safari and Pixel 9 in Chrome.
const PHONES = { "iPhone 12": [390, 664], "Pixel 9": [412, 780] };
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain",
  ".webmanifest": "application/manifest+json",
};

let temporary, site, server, base, chrome, page;

function serve() {
  server = createServer(async (request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const file = resolve(site, "." + (path.endsWith("/") ? path + "index.html" : path));
    try {
      if (!file.startsWith(site + sep)) throw new Error("outside");
      const body = await readFile(file);
      response
        .writeHead(200, {
          "Content-Type": TYPES[extname(file)] || "application/octet-stream",
          "Cache-Control": "no-cache",
        })
        .end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  return new Promise((done) =>
    server.listen(0, "127.0.0.1", () => done(`http://127.0.0.1:${server.address().port}`)),
  );
}

class Page {
  #id = 0;
  #pending = new Map();
  constructor(socket) {
    this.socket = socket;
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id) this.#pending.get(message.id)?.(message);
    };
  }
  send(method, params = {}) {
    return new Promise((done, fail) => {
      this.#pending.set(++this.#id, (message) =>
        message.error
          ? fail(new Error(`${method}: ${message.error.message}`))
          : done(message.result),
      );
      this.socket.send(JSON.stringify({ id: this.#id, method, params }));
    });
  }
  async eval(expression) {
    const { result, exceptionDetails } = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails)
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  }
  async until(expression, timeout = 5000) {
    for (
      const end = Date.now() + timeout;
      Date.now() < end;
      await new Promise((done) => setTimeout(done, 50))
    ) {
      try {
        if (await this.eval(expression)) return;
      } catch {
        /* Page is still loading. */
      }
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }
  click(selector, index = 0) {
    return this.eval(`document.querySelectorAll(${JSON.stringify(selector)})[${index}].click()`);
  }
  // Currency formats use no-break spaces; compare them as normal spaces.
  text(selector) {
    return this.eval(
      `document.querySelector(${JSON.stringify(selector)}).textContent.replace(/[\\u00a0\\u202f]/g, ' ')`,
    );
  }
  async open(url, [width, height] = PHONES["iPhone 12"], language = "en") {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await this.send("Page.navigate", { url });
    await this.until(`document.querySelectorAll('.item').length === 6`);
    if ((await this.eval(`document.documentElement.lang`)) !== language)
      await this.click(`[data-lang="${language}"]`);
  }
}

before(async () => {
  if (skip) return;
  temporary = await mkdtemp(join(tmpdir(), "simple-bar-ui-"));
  site = join(temporary, "dist");
  await build(site);
  await writeFile(join(site, "config.json"), JSON.stringify(MENU));
  base = await serve();
  const profile = join(temporary, "profile");
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      // GitHub's Ubuntu runners restrict the user namespaces Chrome's sandbox needs.
      ...(process.env.CI ? ["--no-sandbox"] : []),
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    await new Promise((done) => setTimeout(done, 100));
    port = (await readFile(join(profile, "DevToolsActivePort"), "utf8").catch(() => "")).split(
      "\n",
    )[0];
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const socket = new WebSocket(
    targets.find((target) => target.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((done, fail) => {
    socket.onopen = done;
    socket.onerror = fail;
  });
  page = new Page(socket);
  await page.send("Page.enable");
});

after(async () => {
  page?.socket.close();
  chrome?.kill();
  server?.closeAllConnections();
  server?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true, maxRetries: 5 });
});

for (const [phone, size] of Object.entries(PHONES)) {
  test(
    `${phone}: 4 drinks and 2 deposit items fit without scrolling, with large touch targets`,
    { skip },
    async () => {
      for (const language of ["en", "de"]) {
        await page.open(base + "/", size, language);
        const layout = await page.eval(`(() => {
        const visibleBottom = document.querySelector('.content').getBoundingClientRect().bottom;
        const items = [...document.querySelectorAll('.item')].map(item => item.getBoundingClientRect());
        const steps = [...document.querySelectorAll('.step, .clear')].map(button => button.getBoundingClientRect());
        return {
          hidden: items.filter(item => item.top < 0 || item.bottom > visibleBottom + 0.5).length,
          gap: Math.round(items[1].top - items[0].bottom),
          smallestTarget: Math.min(...steps.map(button => Math.min(button.width, button.height))),
          overflow: document.documentElement.scrollWidth - innerWidth,
          checkoutVisible: document.querySelector('.checkout').getBoundingClientRect().bottom <= innerHeight + 0.5
        };
      })()`);
        assert.equal(layout.hidden, 0, `${language}: items cut off`);
        assert.ok(layout.gap >= 8, `${language}: gap between items is ${layout.gap}px`);
        assert.ok(
          layout.smallestTarget >= 48,
          `${language}: smallest button is ${layout.smallestTarget}px`,
        );
        assert.equal(layout.overflow, 0, `${language}: horizontal scrolling`);
        assert.ok(layout.checkoutVisible, `${language}: order total is off screen`);
      }
    },
  );
}

test("orders, deposit returns, undo and language switch", { skip }, async () => {
  await page.open(base + "/");
  assert.equal(await page.text("#bar-name"), "Cocktail Bar");
  assert.equal(await page.eval(`document.querySelector('#app-name').hidden`), false);
  assert.equal(await page.text("#connection"), "Online");
  await page.click(".step.plus", 0);
  await page.click(".step.plus", 0);
  await page.click(".step.plus", 2);
  await page.click(".step.plus", 4); // Return a cup.
  assert.equal(await page.text("#total"), "€14.00");
  assert.equal(await page.text("#drinks-subtotal"), "€16.00");
  assert.equal(await page.text("#returns-subtotal"), "−€2.00");
  assert.equal(await page.text("#drink-count"), "3 items");
  assert.equal(await page.eval(`document.querySelectorAll('.item.selected').length`), 3);
  await page.click(".step:not(.plus)", 0);
  assert.equal(await page.text("#total"), "€8.00");

  await page.click("#clear");
  assert.equal(await page.text("#total"), "€0.00");
  assert.equal(await page.text("#clear"), "Undo");
  await page.click("#clear");
  assert.equal(await page.text("#total"), "€8.00", "undo restores the order");
  assert.equal(await page.text("#clear"), "Clear");

  await page.click("#clear");
  await page.click(".step.plus", 1);
  assert.equal(await page.text("#clear"), "Clear", "a new order ends the undo offer");
  assert.equal(await page.text("#total"), "€5.00");

  await page.click('[data-lang="de"]');
  assert.equal(await page.text("#bar-name"), "Cocktail-Bar");
  assert.equal(await page.text("#total"), "5,00 €");
  assert.equal(await page.text("#clear"), "Löschen");
  assert.equal(await page.eval(`document.title`), "Cocktail-Bar · Simple-Bar-Calculator");
  await page.click('[data-lang="en"]');
});

test(
  "works offline after the first visit (reload, back button) and recovers when the server returns",
  { skip },
  async () => {
    await page.open(base + "/");
    await page.until(`navigator.serviceWorker.controller !== null`);
    await page.until(
      `caches.open('bar-calculator-config').then(cache => cache.match('./config.json')).then(Boolean)`,
    );
    await page.send("Page.navigate", { url: "about:blank" });
    await page.until(`location.href === 'about:blank'`);
    server.closeAllConnections();
    await new Promise((done) => server.close(done));

    await page.eval(`history.back()`);
    await page.until(
      `location.href === ${JSON.stringify(base + "/")} && document.querySelectorAll('.item').length === 6`,
    );
    await page.until(`document.querySelector('#connection').textContent === 'Offline'`);
    for (const url of [base + "/", base + "/?source=homescreen"]) {
      await page.send("Page.navigate", { url });
      await page.until(`document.querySelector('#connection')?.textContent === 'Offline'`);
      assert.equal(await page.eval(`document.querySelectorAll('.item').length`), 6, url);
    }
    await page.click(".step.plus", 0);
    assert.equal(await page.text("#total"), "€6.00");

    // Server back with a changed price: the app goes online and updates without losing the order.
    const changed = structuredClone(MENU);
    changed.beverages[0].price = 5;
    await writeFile(join(site, "config.json"), JSON.stringify(changed));
    await new Promise((done) => server.listen(new URL(base).port, "127.0.0.1", done));
    await page.eval(`window.dispatchEvent(new Event('online'))`);
    await page.until(`document.querySelector('#connection').textContent === 'Online'`);
    assert.equal(await page.text("#total"), "€7.00");
  },
);
