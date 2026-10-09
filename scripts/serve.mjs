// SPDX-License-Identifier: LGPL-3.0-only
// Copyright (C) 2026 jjm.one
// Development/preview only. Use Nginx or a static host for production.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { watch } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "./build.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = resolve(root, "dist");
const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || (dev ? 5173 : 4173));
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("PORT must be 1024–65535.");
if (dev) {
  await build();
  let timer;
  let pending = Promise.resolve();
  const rebuild = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(() => build()).catch((error) => console.error(error.message));
    }, 100);
  };
  for (const name of ["src", "public"]) watch(resolve(root, name), { recursive: true }, rebuild);
  for (const name of ["index.html", "LICENSE", "COPYING"]) watch(resolve(root, name), rebuild);
} else {
  await stat(resolve(directory, "index.html")); // Build first; never serve source files.
}
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};
createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method)) {
    response.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const file = resolve(
      directory,
      "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
    );
    if (
      !file.startsWith(directory + sep) ||
      pathname.split("/").some((part) => part.startsWith("."))
    ) {
      response.writeHead(404).end();
      return;
    }
    const content = await readFile(file);
    response.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "Content-Length": content.length,
      "Cache-Control": file === resolve(directory, "config.json") ? "no-store" : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Open http://localhost:${port}. Reload after source changes.`),
);
