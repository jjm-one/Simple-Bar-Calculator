FROM node:26.10.0-alpine@sha256:0b36e8c136b94cd4fcf02188228e76c31ad5872eef3fec8cbd2eee500cfd9e80 AS build

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

FROM nginxinc/nginx-unprivileged:1.30.5-alpine-slim@sha256:3af0c10d960cc2502427fe1219c52989d309e7d65596869c60a34fd2fa2406f0

COPY --chmod=0444 docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY --chmod=0555 docker/start.sh /usr/local/bin/start-site
COPY --from=build /app/dist/ /srv/site/

USER 101:101
ENV HTTP_PORT=8080
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/local/bin/start-site"]
