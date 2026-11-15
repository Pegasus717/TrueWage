# Deploying TrueWage on Vultr

Status: **deployed on a Vultr Cloud Compute server** with `deploy/vultr-startup.sh` (first-boot script: Docker, this repository, Caddy with automatic HTTPS on a free `<ip>.sslip.io` name). The manual steps below do the same thing by hand. `tools/smoke.py` verifies a deployment in one command. Console menu names may differ slightly from Vultr's current UI.

TrueWage needs very little: one small Linux VM, Python 3 or Docker, and (optionally) a domain for HTTPS. The database is a single SQLite file inside the data folder (no separate DB server). **Use HTTPS for real riders**: passwords and session cookies must not travel over plain HTTP.

## 0. One-paste setup (no SSH needed)

In the Vultr console open **Products > Scripts > Add Startup Script**, paste the contents of [`vultr-startup.sh`](vultr-startup.sh), then pick that script when you deploy the server (Ubuntu 24.04, 1 vCPU / 1 GB is enough). About five minutes after the server shows *Running*, the app answers at `https://<server-ip-with-dashes>.sslip.io` (for IP 1.2.3.4 that is `https://1-2-3-4.sslip.io`). The script is safe to run again. Progress is in `/var/log/truewage-setup.log`.

## 1. Create the server

1. In the Vultr console choose **Deploy +** → **Cloud Compute** (shared CPU is plenty) → a location close to your users (Mumbai, Bangalore or Delhi if available) → **Ubuntu 22.04 or 24.04**. A 1 vCPU / 1 GB plan is enough for a demo.
2. Add your SSH key, deploy, and note the server's IP address.
3. Firewall: in **Products → Firewall** create a group allowing inbound TCP **22** (SSH), **80** and **443** (and **8080** only if you will not use a domain). Attach it to the server.

## 2a. Docker Compose (recommended)

```bash
ssh root@SERVER_IP
curl -fsSL https://get.docker.com | sh            # installs Docker Engine + compose plugin
git clone <your-repo-url> truewage && cd truewage
cp .env.example .env                              # optional: add ANTHROPIC_API_KEY for Claude vision
docker compose up -d --build
```

The app is now on `http://SERVER_IP:8080`.

**With a domain and automatic HTTPS** (Caddy fetches certificates; ports 80/443 must be open and the DNS **A record** must already point to the server):

```bash
cat >> .env <<'EOF'
DOMAIN=truewage.example.com
APP_PORT=127.0.0.1:8080
TRUEWAGE_TRUST_PROXY=1
EOF
docker compose --profile https up -d --build
```

## 2b. Without Docker (systemd)

```bash
ssh root@SERVER_IP
apt-get update && apt-get install -y python3 git
useradd --system --home /opt/truewage truewage
git clone <your-repo-url> /opt/truewage && cd /opt/truewage
mkdir -p /var/lib/truewage && chown truewage /var/lib/truewage
cp .env.example .env && chown truewage .env && chmod 600 .env     # optional: add ANTHROPIC_API_KEY
cp deploy/truewage.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now truewage
```

Put Caddy or nginx in front for HTTPS (`reverse_proxy 127.0.0.1:8080`) and set `TRUEWAGE_TRUST_PROXY=1` in `.env`.

## 3. Verify

From any machine with Python 3:

```bash
python tools/smoke.py https://truewage.example.com     # or http://SERVER_IP:8080
```

Expected: 33 `PASS` lines and `ALL CHECKS PASSED` (it creates and deletes a throwaway test account). The script also prints whether Claude vision is on. Then open the site on a phone, press **Create my account** and add the sample screenshots, or press a **Demo rider** button.

## 4. Operate

| Task | Command |
|---|---|
| Logs | `docker compose logs -f app` (or `journalctl -u truewage -f`) |
| Update | `git pull && docker compose up -d --build` (or `git pull && systemctl restart truewage`) |
| Back up accounts (`truewage.db`, `secret.key`), registry + city contributions (back up the whole folder; losing `secret.key` only changes anonymous contribution ids) | `docker run --rm -v truewage_truewage-data:/data -v "$PWD":/b alpine tar czf /b/truewage-data.tgz -C /data .` (systemd: copy `/var/lib/truewage`) |
| Change API key | edit `.env`, then `docker compose up -d` (or `systemctl restart truewage`) |

## Notes

* Without `ANTHROPIC_API_KEY` everything works; screenshots are read by on-device OCR in the visitor's browser.
* The server stores rider accounts (name, phone, scrypt password hash, the rider's own computed data), statement hashes/summaries and anonymous aggregate contributions in `TRUEWAGE_DATA` (`/data` in Docker). Screenshots are never stored. Keep that folder private and backed up; there is no password recovery (no SMS/email).
* For an online database see [SUPABASE.md](SUPABASE.md): set `DATABASE_URL` and nothing on this server needs backing up. Without it, the local database (`truewage.db`) holds users, per-rider documents, a relational copy of orders/shifts/expenses, import history, statements, activity and AI usage. `extract_cache.json` caches AI readings per image (no personal data beyond the extracted order numbers); `ai_usage.json` counts the server-wide daily image budget. Back up the whole data folder.
* AI cost controls are environment variables: `TRUEWAGE_AI_DAILY_IMAGES`, `TRUEWAGE_AI_USER_DAILY`, `TRUEWAGE_AI_USER_ASKS`, `TRUEWAGE_EXTRACT_MODEL`, `TRUEWAGE_ESCALATE_MODEL`, `TRUEWAGE_MODEL`.
* Behind HTTPS set `TRUEWAGE_TRUST_PROXY=1` (cookie gets the `Secure` flag), or `TRUEWAGE_COOKIE_SECURE=1` to force it.
* Keep `.env` out of git (it is in `.gitignore`). Do not publish the server's API key; if it leaks, rotate it in the Anthropic console.
