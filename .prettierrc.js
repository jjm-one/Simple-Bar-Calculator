/**
 * -------------------------------------------------------------------
 * Common Editor Config
 * Repository : https://github.com/jonas-merkle/Common-Editor-Config
 * Author     : Jonas Merkle
 * License    : GNU Lesser General Public License v3.0 (LGPLv3)
 * Versioning : Semantic Versioning (SemVer) via Git tags
 * Version    : @VERSION@
 * Description: Prettier configuration for web and scripting files.
 * © 2025 Jonas Merkle. Licensed under the LGPLv3.
 * -------------------------------------------------------------------
 */
export default {
  printWidth: 100,
  tabWidth: 2,
  useTabs: false,
  semi: true,
  singleQuote: false,
  trailingComma: "all",
  bracketSpacing: true,
  bracketSameLine: false,
  arrowParens: "always",
  endOfLine: "lf",
  overrides: [
    { files: ["*.md", "*.mdx"], options: { proseWrap: "preserve", tabWidth: 2 } },
    { files: ["*.json", "*.jsonc"], options: { tabWidth: 2 } },
    { files: ["*.yaml", "*.yml"], options: { tabWidth: 2 } },
    { files: ["*.css", "*.scss", "*.less", "*.html", "*.htm", "*.vue"], options: { tabWidth: 2 } },
    {
      files: ["*.ts", "*.tsx", "*.cts", "*.mts", "*.js", "*.jsx", "*.mjs", "*.cjs"],
      options: { tabWidth: 2 },
    },
  ],
};
