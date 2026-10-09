#!/usr/bin/env bash
# SPDX-License-Identifier: LGPL-3.0-only
# Copyright (C) 2026 jjm.one
set -eo pipefail

# The image ships Node.js 24; use the image's nvm only if .nvmrc requires a different version.
# --no-use stops nvm.sh from activating .nvmrc on load, which fails while that version is not installed.
if [ "$(node --version)" != "v$(cat .nvmrc)" ]; then
  source /usr/local/share/nvm/nvm.sh --no-use
  nvm install
  nvm alias default "$(cat .nvmrc)"
fi
npm install --global "$(node -p 'require("./package.json").packageManager')" --ignore-scripts --no-audit --no-fund
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build
