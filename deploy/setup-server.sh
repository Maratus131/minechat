#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo 'Run: sudo sh deploy/setup-server.sh' >&2
  exit 1
fi
. /etc/os-release
if [ "$ID" != ubuntu ]; then
  echo 'This script supports Ubuntu only.' >&2
  exit 1
fi

apt-get update
apt-get install -y ca-certificates curl openssl
if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' \
    "$VERSION_CODENAME" "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/docker.sources
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker
printf 'vm.max_map_count=1048576\n' > /etc/sysctl.d/90-minechat-elasticsearch.conf
sysctl -p /etc/sysctl.d/90-minechat-elasticsearch.conf
docker compose version
