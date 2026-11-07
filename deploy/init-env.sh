#!/bin/sh
set -eu

cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
umask 077

if [ -e .env.prod ]; then
  printf '%s\n' '.env.prod already exists; leaving it unchanged.'
  exit 0
fi

origin=${1:-http://localhost}
case "$origin" in
  http://*|https://*) ;;
  *) printf '%s\n' 'Usage: sh deploy/init-env.sh http://PUBLIC_IP (or https://DOMAIN)' >&2; exit 1 ;;
esac
# Keep values safe for Docker Compose env-file syntax and require an origin, not a path.
authority=${origin#*://}
case "$authority" in
  ''|*[!a-zA-Z0-9.:-]*) printf '%s\n' 'Pass an origin without paths, credentials, whitespace or query parameters.' >&2; exit 1 ;;
esac

command -v openssl >/dev/null 2>&1 || { printf '%s\n' 'Install openssl before generating secrets.' >&2; exit 1; }
db_password=$(openssl rand -hex 32)
jwt_secret=$(openssl rand -base64 32)
site_address=$origin
if [ "$origin" = 'http://localhost' ]; then site_address=:80; fi

# noclobber also prevents overwriting a file created concurrently after the check above.
set -C
{
  printf 'DB_PASSWORD=%s\n' "$db_password"
  printf 'JWT_SECRET=%s\n' "$jwt_secret"
  printf 'SITE_ADDRESS=%s\n' "$site_address"
  printf 'CORS_ORIGINS=%s\n' "$origin"
} > .env.prod
chmod 600 .env.prod
printf '%s\n' '.env.prod created with private permissions; secrets were not printed.'
if [ "$origin" = 'http://localhost' ]; then
  printf '%s\n' 'Before remote use, set SITE_ADDRESS and CORS_ORIGINS in .env.prod to your public origin.'
fi
