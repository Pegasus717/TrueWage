#!/bin/bash
# TrueWage first-boot script for a Vultr Ubuntu server (paste into Vultr "Startup Scripts" or "User Data").
# It installs Docker, fetches the public repository, and starts the app behind Caddy with automatic HTTPS
# on a free name derived from the server's IP address (<ip-with-dashes>.sslip.io), so no domain is needed.
# It contains no secrets. Add ANTHROPIC_API_KEY or DATABASE_URL afterwards in /opt/truewage/.env (see deploy/VULTR.md).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
exec > >(tee -a /var/log/truewage-setup.log) 2>&1

REPO="${TRUEWAGE_REPO:-https://github.com/Pegasus717/TrueWage.git}"
APP_DIR=/opt/truewage

apt-get update -y
apt-get install -y git curl ca-certificates ufw
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

IP="$(curl -4 -fsS --retry 5 https://api.ipify.org)"
DOMAIN="${IP//./-}.sslip.io"

if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone --depth 1 "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  chmod 600 .env
fi
# Settings for running behind Caddy. Re-running the script keeps any keys already added.
sed -i '/^DOMAIN=/d;/^APP_PORT=/d;/^TRUEWAGE_TRUST_PROXY=/d;/^TRUEWAGE_COOKIE_SECURE=/d' .env
{
  echo "DOMAIN=$DOMAIN"
  echo "APP_PORT=127.0.0.1:8080"
  echo "TRUEWAGE_TRUST_PROXY=1"
  echo "TRUEWAGE_COOKIE_SECURE=1"
} >> .env

docker compose --profile https up -d --build
echo "TrueWage is starting at https://$DOMAIN"
echo "$DOMAIN" > /root/truewage-url.txt
