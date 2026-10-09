# Simple-Bar-Calculator

An installable web app for bar staff that totals drink orders including deposits and credits returned deposit items. It is built for phones in portrait mode, works offline, and is available in English and German.

The app is plain HTML, CSS, and JavaScript without a backend or runtime dependencies. A small Node.js build creates the static site in `dist/`.

## Using the app

- Tap **+** / **−** to add or remove drinks and returned deposit items. Each drink adds its price plus the deposit of its item; each return subtracts its deposit.
- **Clear** resets the order; **Undo** restores it for 5 seconds.
- **EN / DE** switches the language and is remembered on the device. Without a saved choice, the device language is used.
- The status below the title shows **Online**, or **Offline** while the server is unreachable and the last valid menu is used. When the server is reachable again, the app loads the current menu and keeps the order.
- While visible, the app keeps the screen on where the browser supports it.

To install it, choose **Share → Add to Home Screen** in iOS Safari or **Install app** in Chrome on Android. Open the app once online; afterwards it also starts without a connection. Installation and offline use require HTTPS (or localhost).

Orders are kept in memory only; reloading the page clears them.

## Menu configuration

The menu is a JSON file: `public/config.json` for development and GitHub Pages, or the mounted `config/config.json` for Docker.

```json
{
  "name": "Beer Bar",
  "name_de": "Bier-Bar",
  "currency": "EUR",
  "beverages": [
    { "id": "beer", "name": "Beer", "name_de": "Bier", "price": 3.5, "deposit_item_id": "bottle" }
  ],
  "deposit_items": [{ "id": "bottle", "name": "Bottle", "name_de": "Flasche", "deposit": 2.0 }]
}
```

| Field             | Required | Description                                                           |
| ----------------- | -------- | --------------------------------------------------------------------- |
| `name`, `name_de` | no       | Bar name shown in the title bar; the app name stays visible below it. |
| `currency`        | no       | ISO 4217 code, default `EUR`.                                         |
| `beverages[]`     | yes      | `id`, `name`, optional `name_de`, `price`, and `deposit_item_id`.     |
| `deposit_items[]` | yes      | `id`, `name`, optional `name_de`, and `deposit`.                      |

- IDs must be unique within their list; `deposit_item_id` must refer to an existing deposit item.
- Prices and deposits are non-negative numbers with at most two decimals (`3.5`, not `"3,50"`).
- Without `name_de`, `name` is used in both languages.
- If the server delivers an invalid menu, the app shows an error instead of using an older one, so no outdated prices are charged. Only when the server is unreachable does it fall back to the last valid menu.
- The menu is public. Do not put private data in it.

Example menus are in [`examples/`](examples/): `cocktail-bar.json` and `bier-bar.json`.

## Development

Requires Node.js 24.21.0 (see `.nvmrc`) and npm 12.2.0 (see `packageManager` in `package.json`).

```sh
npm ci
npm run dev   # http://localhost:5173, rebuilds on changes
```

| Command           | Purpose                                                           |
| ----------------- | ----------------------------------------------------------------- |
| `npm run dev`     | Build, watch, and serve on port 5173                              |
| `npm run build`   | Validate `public/config.json` and build the site in `dist/`       |
| `npm run preview` | Serve `dist/` on port 4173                                        |
| `npm test`        | Unit and build tests                                              |
| `npm run test:ui` | Browser tests in headless Chrome: phone layout, ordering, offline |
| `npm run check`   | JavaScript syntax check                                           |
| `npm run format`  | Format with Prettier (`format:check` only checks)                 |

`PORT` changes the development and preview port. `npm run test:ui` needs Google Chrome or Chromium; set `CHROME_PATH` if it is not found. Without Chrome, the browser tests are skipped locally but fail in CI. If an installed copy keeps showing an old version during development, clear the site data in the browser.

The build names the offline cache after a hash of the app files, so installed copies pick up every new version automatically.

### Dev container

Open the repository in VS Code and choose **Reopen in Container**. The container provides Node.js, npm, Python, and its own Docker Engine (it runs privileged for that), installs the dependencies, and runs tests and a build. The Docker integration tests also run inside it; the browser tests are skipped because there is no Chrome.

### Project structure

| Path                                    | Contents                                                    |
| --------------------------------------- | ----------------------------------------------------------- |
| `index.html`, `src/`                    | App markup, behavior, styles, translations, and calculation |
| `public/`                               | Default menu, service worker, manifest, icons, and logo     |
| `scripts/`                              | Build and development server, plus build tests              |
| `tests/`                                | Browser tests and Docker integration tests                  |
| `examples/`                             | Example menus                                               |
| `Dockerfile`, `compose.yaml`, `docker/` | Container hosting                                           |
| `.github/`                              | CI, GitHub Pages deployment, and Dependabot                 |
| `.devcontainer/`                        | Dev container                                               |
| `brand-reference/`                      | jjm.one logo source files                                   |
| `docs/dependencies.md`                  | Pinned tool and image versions                              |

## Deployment with GitHub Pages

1. In the repository settings, set **Pages → Build and deployment → Source** to **GitHub Actions**.
2. Push to `main`.

The CI workflow checks formatting and runs all tests, including the browser and Docker tests. The deployment publishes `dist/` only after CI has passed. The app uses relative URLs, so it works under the project path `https://jjm-one.github.io/Simple-Bar-Calculator/`.

## Deployment with Docker

The image serves the site with Nginx over plain HTTP. HTTPS is handled by a reverse proxy in front of it. The site and the Docker image are built entirely inside Docker; Node.js is not needed on the host.

```sh
cp .env.example .env
mkdir -p config
cp public/config.json config/config.json
chmod 755 config && chmod 644 config/config.json
docker compose up -d --build --wait
```

The site is then available at <http://127.0.0.1:8080>, bound to the loopback interface only. Docker Engine 28 or newer is required.

| Variable (`.env`) | Default              | Meaning                                             |
| ----------------- | -------------------- | --------------------------------------------------- |
| `HOST_PORT`       | `8080`               | Port on the host (always bound to `127.0.0.1`)      |
| `HTTP_PORT`       | `8080`               | Port inside the container (1024–65535)              |
| `DOCKER_NETWORK`  | `simple-bar-backend` | Network for a reverse proxy running in a container  |
| `CONFIG_DIR`      | `./config`           | Host directory containing `config.json` (read-only) |

After changes to the app, run `docker compose up -d --build --wait` again.

### Reverse proxy

- **Proxy on the host:** forward to `http://127.0.0.1:8080`.
- **Proxy in a container:** add the network to the proxy's Compose file and forward to `http://simple-bar-calculator:8080`. Start this stack first so that the network exists.

```yaml
networks:
  simple-bar-backend:
    external: true
```

Serve the app at the root path, or let the proxy strip the path prefix.

### Changing the menu

Edit `config/config.json` on the host. No restart is needed; the app loads the new menu the next time it is opened, brought to the foreground, or reconnected. To replace the file from a script, validate it first and then move it into place atomically:

```sh
node --input-type=module -e "import fs from 'node:fs'; import {validateConfig} from './src/lib/calc.mjs'; validateConfig(JSON.parse(fs.readFileSync(process.argv[1], 'utf8')));" config/config.next.json
chmod 644 config/config.next.json
mv config/config.next.json config/config.json
```

The container does not start without a readable `config.json`. Only this file is served from the directory; symlinks are rejected. The image contains no menu of its own.

### Security

- **Container:** runs as UID 101 with a read-only file system and no Linux capabilities. Privilege escalation is blocked, and resource limits are set.
- **Nginx:** allows only GET and HEAD and sends security headers, including a strict Content Security Policy. The same policy is also set in `index.html` for static hosts.
- **Menu content:** names are displayed as text only, so the menu cannot inject HTML.

### Checks

```sh
docker compose logs site
python3 tests/docker.test.py
```

`tests/docker.test.py` checks the running stack: port binding, network, permissions, headers, and read-only mounts. Tests that modify the menu file run only if `DOCKER_TEST_CONFIG_DIR` points to the mounted directory, which should be a disposable one.

## Dependencies

The app has no runtime dependencies; Prettier is the only npm package. Pinned versions are listed in [docs/dependencies.md](docs/dependencies.md). Dependabot proposes weekly updates for GitHub Actions, npm, dev container features, and Docker images.

## License

Copyright © 2026 jjm.one. Licensed under the **GNU Lesser General Public License v3.0 only** (`LGPL-3.0-only`). See [LICENSE](LICENSE) and [COPYING](COPYING); both are included in the app as `license.txt`.
