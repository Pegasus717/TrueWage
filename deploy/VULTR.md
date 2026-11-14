# Deploying TrueWage on Vultr

Status: **documented, not executed by the author.** The development machine had no Docker and no Vultr account, so these steps were not run end to end. The application itself (same `server.py`, same files) is tested locally, and `tools/smoke.py` is provided so you can verify a deployment in one command. Console menu names may differ slightly from Vultr's current UI.

TrueWage needs very little: one small Linux VM, Python 3 or Docker, and (optionally) a domain for HTTPS. No database.

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

Expected: 23 `PASS` lines and `ALL CHECKS PASSED`. The script also prints whether Claude vision is on. Then open the site on a phone and press **See a demo rider**.

## 4. Operate

| Task | Command |
|---|---|
| Logs | `docker compose logs -f app` (or `journalctl -u truewage -f`) |
| Update | `git pull && docker compose up -d --build` (or `git pull && systemctl restart truewage`) |
| Back up registry + city contributions | `docker run --rm -v truewage_truewage-data:/data -v "$PWD":/b alpine tar czf /b/truewage-data.tgz -C /data .` (systemd: copy `/var/lib/truewage`) |
| Change API key | edit `.env`, then `docker compose up -d` (or `systemctl restart truewage`) |

## Notes

* Without `ANTHROPIC_API_KEY` everything works; screenshots are read by on-device OCR in the visitor's browser.
* The server stores only statement hashes/summaries and anonymous aggregate contributions in `TRUEWAGE_DATA` (`/data` in Docker). Screenshots are never stored.
* Keep `.env` out of git (it is in `.gitignore`). Do not publish the server's API key; if it leaks, rotate it in the Anthropic console.
