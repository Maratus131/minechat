#!/bin/sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
if [ ! -f .env.prod ]; then
  echo 'First run: sh deploy/init-env.sh http://PUBLIC_IP' >&2
  exit 1
fi
compose() { docker compose -p minechat-prod --env-file .env.prod -f compose.prod.yaml "$@"; }
compose config --quiet
case "${1:-}" in
  '') compose build ;;
  --no-build) ;;
  *) echo 'Usage: sh deploy/deploy.sh [--no-build]' >&2; exit 1 ;;
esac
compose up -d --no-build --wait --wait-timeout 300
attempt=0
while [ "$attempt" -lt 60 ]; do
  if compose exec -T web sh -c 'wget -S -O /dev/null -T 5 http://backend:8080/api/v1/users/me 2>&1 | grep -Eq "HTTP/[0-9.]+ 401"'; then
    compose ps
    echo 'Backend is responding; anonymous profile request correctly returns 401.'
    echo 'Now open the configured public address and check registration and messages.'
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 2
done
echo 'Backend did not become ready. Check container logs before retrying.' >&2
compose ps
exit 1
