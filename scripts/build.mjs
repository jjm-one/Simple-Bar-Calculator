// SPDX-License-Identifier: LGPL-3.0-only
// Copyright (C) 2026 jjm.one
import { createHash } from "node:crypto";
import { copyFile, cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "../src/lib/calc.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));

export async function build(output = resolve(root, "dist")) {
  // Validate before touching the previous build.
  validateConfig(JSON.parse(await readFile(resolve(root, "public/config.json"), "utf8")));
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });
  await cp(resolve(root, "public"), output, { recursive: true });
  await copyFile(resolve(root, "index.html"), resolve(output, "index.html"));
  await copyFile(resolve(root, "src/main.js"), resolve(output, "main.js"));
  await copyFile(resolve(root, "src/styles.css"), resolve(output, "styles.css"));
  for (const directory of ["lib", "i18n"])
    await mkdir(resolve(output, directory), { recursive: true });
  await copyFile(resolve(root, "src/lib/calc.mjs"), resolve(output, "lib/calc.mjs"));
  await copyFile(
    resolve(root, "src/i18n/translations.js"),
    resolve(output, "i18n/translations.js"),
  );
  const [lgpl, gpl] = await Promise.all(
    ["LICENSE", "COPYING"].map((name) => readFile(resolve(root, name), "utf8")),
  );
  await writeFile(
    resolve(output, "license.txt"),
    "Simple-Bar-Calculator\nCopyright (C) 2026 jjm.one\nSPDX-License-Identifier: LGPL-3.0-only\n" +
      "Source: https://github.com/jjm-one/Simple-Bar-Calculator\n\n" +
      lgpl +
      "\n\n" +
      gpl,
  );
  await versionServiceWorker(output);
}

// Name the offline cache after the content of all app files (menu data excluded),
// so installed apps update whenever any of them changes.
export async function versionServiceWorker(output) {
  const worker = resolve(output, "sw.js");
  const source = await readFile(worker, "utf8");
  if (!source.includes("__BUILD_HASH__"))
    throw new Error("sw.js lacks the __BUILD_HASH__ placeholder.");
  const hash = createHash("sha256").update(source);
  const files = (await readdir(output, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name))
    .filter((file) => file !== worker && file !== resolve(output, "config.json"))
    .sort();
  for (const file of files) hash.update(file.slice(output.length)).update(await readFile(file));
  await writeFile(worker, source.replaceAll("__BUILD_HASH__", hash.digest("hex").slice(0, 16)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await build();
  console.log("Static production site built in dist/.");
}
