#!/bin/sh
set -eu

HTTP_PORT=${HTTP_PORT:-8080}
case "$HTTP_PORT" in
  ''|*[!0-9]*) echo 'HTTP_PORT must be an integer from 1024 to 65535.' >&2; exit 1 ;;
esac
if [ "${#HTTP_PORT}" -gt 5 ] || [ "$HTTP_PORT" -lt 1024 ] || [ "$HTTP_PORT" -gt 65535 ]; then
  echo 'HTTP_PORT must be an integer from 1024 to 65535.' >&2
  exit 1
fi
export HTTP_PORT

CONFIG_FILE=/etc/simple-bar-config/config.json
if [ ! -f "$CONFIG_FILE" ] || [ ! -r "$CONFIG_FILE" ] || [ -L "$CONFIG_FILE" ]; then
  echo 'Mount a readable regular config.json in /etc/simple-bar-config (no symlinks).' >&2
  exit 1
fi

# Substitute only the port; preserve Nginx variables such as $uri.
envsubst '${HTTP_PORT}' < /etc/nginx/nginx.conf.template > /tmp/nginx.conf
exec nginx -c /tmp/nginx.conf -g 'daemon off;'
