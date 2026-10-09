# Dependency snapshot

Verified on 2026-10-09 against official upstream releases and registries. Node.js stays on the current LTS line and Nginx stays on its stable branch.

| Component                     | Version                                                                                    | Source                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| Node.js                       | 24.21.0 LTS                                                                                | https://nodejs.org/en/download                                                             |
| npm                           | 12.2.0                                                                                     | https://github.com/npm/cli/releases                                                        |
| Prettier (dev only)           | 3.9.9, exact version in package.json                                                       | https://github.com/prettier/prettier/releases                                              |
| Node.js Docker build stage    | 24.21.0-alpine, digest-pinned                                                              | https://hub.docker.com/_/node                                                              |
| Nginx unprivileged            | 1.30.5-alpine-slim                                                                         | https://github.com/nginx/docker-nginx-unprivileged/blob/main/stable/alpine-slim/Dockerfile |
| Devcontainer base             | javascript-node 5.2.2-24-trixie (Debian 13, Node.js 24.21.0, Python 3.13.5), digest-pinned | https://mcr.microsoft.com/v2/devcontainers/javascript-node/manifests/5.2.2-24-trixie       |
| Docker-in-Docker feature      | 4.1.3 (Docker CE, `moby: false` for Debian 13)                                             | https://github.com/devcontainers/features/tree/main/src/docker-in-docker                   |
| actions/checkout              | v7.0.1                                                                                     | https://github.com/actions/checkout/releases                                               |
| actions/setup-node            | v7.1.0                                                                                     | https://github.com/actions/setup-node/releases                                             |
| actions/upload-pages-artifact | v5.0.0                                                                                     | https://github.com/actions/upload-pages-artifact/releases                                  |
| actions/configure-pages       | v6.0.0                                                                                     | https://github.com/actions/configure-pages/releases                                        |
| actions/deploy-pages          | v5.0.1                                                                                     | https://github.com/actions/deploy-pages/releases                                           |

Action release tags were resolved to exact Git commit IDs via the GitHub API. Docker and devcontainer digests were resolved directly from their registries. Full pins are stored in the corresponding configuration files. Node.js is defined in `.nvmrc`; npm is defined by `packageManager` in `package.json`.

There are no application/build npm libraries or transitive package dependencies. The lockfile records an empty dependency graph. The Python tests use the standard library, so optional pip development tools are not installed.

Validation: clean npm installation, all 12 tests, JavaScript syntax checks, and production build run on downloaded Node.js 24.21.0 with npm 12.2.0. The Node download was checked against the official SHA-256 checksum. Workflow YAML and asset inputs were checked locally. The multi-stage Docker build and `tests/docker.test.py` were run locally with Docker Engine 29.7.2; the devcontainer image and `scripts/setup-devcontainer.sh` were tested with `docker run`, not with the Dev Containers CLI. Docker integration checks also run in CI and must pass before Pages deployment.
