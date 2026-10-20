FROM node:26.11.1-alpine@sha256:143494b1da2945f061539253adc65e4f1569ddf07da2d384c022c791a9d90a4a AS build

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

FROM nginxinc/nginx-unprivileged:1.31.6-alpine-slim@sha256:1517d8c358e2e093957ebee087afa9eb19a32f5d7ecb711b7429e369cb998224

COPY --chmod=0444 docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY --chmod=0555 docker/start.sh /usr/local/bin/start-site
COPY --from=build /app/dist/ /srv/site/

USER 101:101
ENV HTTP_PORT=8080
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/local/bin/start-site"]
