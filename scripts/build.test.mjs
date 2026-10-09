// SPDX-License-Identifier: LGPL-3.0-only
// Copyright (C) 2026 jjm.one
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build, versionServiceWorker } from "./build.mjs";

test("service worker cache name changes with app files but not with menu data", async () => {
  const output = await mkdtemp(join(tmpdir(), "simple-bar-sw-"));
  const cacheName = async (files) => {
    for (const [name, content] of Object.entries({
      "sw.js": "const CACHE = 'shell-__BUILD_HASH__';",
      ...files,
    })) {
      await writeFile(join(output, name), content);
    }
    await versionServiceWorker(output);
    return readFile(join(output, "sw.js"), "utf8");
  };
  try {
    const first = await cacheName({ "styles.css": "a", "config.json": "{}" });
    assert.match(first, /shell-[0-9a-f]{16}["']/);
    assert.equal(await cacheName({}), first, "same files give the same name");
    assert.equal(
      await cacheName({ "config.json": '{"currency":"USD"}' }),
      first,
      "menu data is ignored",
    );
    assert.notEqual(await cacheName({ "styles.css": "b" }), first, "app changes give a new name");
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("clean build includes linked and offline assets, license, and no tests or repository files", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "simple-bar-build-"));
  const output = join(temporary, "dist");
  try {
    await build(output);
    const html = await readFile(join(output, "index.html"), "utf8");
    const sw = await readFile(join(output, "sw.js"), "utf8");
    const references = [
      ...html.matchAll(/(?:src|href)="\.\/([^"?]+)"/g),
      ...sw.matchAll(/["']\.\/([^"']+)["']/g),
    ];
    assert.ok(references.length > 10, "asset references were found");
    for (const [, asset] of references)
      assert.ok((await stat(resolve(output, asset))).isFile(), asset);
    for (const module of ["main.js", "lib/calc.mjs", "i18n/translations.js"]) {
      const code = await readFile(join(output, module), "utf8");
      for (const [, dependency] of code.matchAll(/from ["'](\.\/[^"']+)["']/g)) {
        assert.ok((await stat(resolve(output, module, "..", dependency))).isFile(), dependency);
      }
    }
    assert.equal(
      await readFile(join(output, "config.json"), "utf8"),
      await readFile(new URL("../public/config.json", import.meta.url), "utf8"),
    );
    assert.match(sw, /bar-calculator-shell-[0-9a-f]{16}["']/);
    const license = await readFile(join(output, "license.txt"), "utf8");
    assert.match(license, /GNU LESSER GENERAL PUBLIC LICENSE/);
    assert.match(license, /GNU GENERAL PUBLIC LICENSE/);
    const files = await readdir(output, { recursive: true });
    assert.ok(
      !files.some(
        (file) => file.endsWith(".test.mjs") || file.startsWith(".git") || file === "node_modules",
      ),
    );
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
