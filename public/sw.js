// SPDX-License-Identifier: LGPL-3.0-only
// Copyright (C) 2026 jjm.one
// scripts/build.mjs replaces the placeholder with a hash of the app files, so every change installs a fresh cache.
const CACHE = "bar-calculator-shell-__BUILD_HASH__";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./main.js",
  "./lib/calc.mjs",
  "./i18n/translations.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./jjm-one-logo.svg",
  "./license.txt",
];
const SHELL_PATHS = new Set(SHELL.map((path) => new URL(path, self.registration.scope).pathname));
const INDEX = new URL("./index.html", self.registration.scope).href;
const MATCH = { ignoreSearch: true, ignoreVary: true };

self.addEventListener("install", (event) => {
  // Bypass the HTTP cache so a new version never stores stale files.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL.map((path) => new Request(path, { cache: "reload" }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (key) =>
                  key.startsWith("bar-calculator-") &&
                  key !== CACHE &&
                  key !== "bar-calculator-config",
              )
              .map((key) => caches.delete(key)),
          ),
        ),
      self.clients.claim(),
    ]),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  // The app validates configuration before saving it; never cache an unvalidated response here.
  if (url.pathname.endsWith("/config.json")) return;
  const navigation = request.mode === "navigate";
  if (!navigation && !SHELL_PATHS.has(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cached = await caches.match(request, MATCH);
      if (cached) return cached;
      try {
        return await fetch(request);
      } catch (error) {
        // Offline page loads (back button, reload, other paths) fall back to the cached app.
        const shell = navigation && (await caches.match(INDEX, MATCH));
        if (shell) return shell;
        throw error;
      }
    })(),
  );
});
