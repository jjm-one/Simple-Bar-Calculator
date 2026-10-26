FROM node:26.12.0-alpine@sha256:6f08a523443ddedf52941874c203475b0ad503e859ad70cb26ab8be9a517dbd5 AS build

WORKDIR /app
COPY index.html LICENSE COPYING ./
COPY scripts/build.mjs scripts/
COPY src/ src/
COPY public/ public/
# Menu data is supplied exclusively by a read-only runtime bind mount; .nojekyll is only for GitHub Pages.
# Read-only modes are set here because COPY preserves them; directories need the execute bit.
RUN node scripts/build.mjs \
 && rm dist/config.json dist/.nojekyll \
 && find dist -type d -exec chmod 0555 {} + \
 && find dist -type f -exec chmod 0444 {} +

FROM nginxinc/nginx-unprivileged:1.31.7-alpine-slim@sha256:a8cb0f33d51fa107c96fd2bd3a71aaf564ec131e9d2bdf8700944f0ed8b170d7

COPY --chmod=0444 docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY --chmod=0555 docker/start.sh /usr/local/bin/start-site
COPY --from=build /app/dist/ /srv/site/

USER 101:101
ENV HTTP_PORT=8080
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/local/bin/start-site"]
