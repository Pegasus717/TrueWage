# Get a live link in about 10 minutes (Render + Supabase)

You already have the database (Supabase). Render runs the app and gives it a public HTTPS address.

1. Sign in at **render.com** with your GitHub account (`Pegasus717`).
2. **New +** > **Blueprint** > choose the repo **Pegasus717/TrueWage**. Render reads `render.yaml`.
3. When it asks for the two secret values, paste them there (they are stored by Render, not in git):
   * `DATABASE_URL`: your Supabase **Session pooler** string (same one as in your local `.env`)
   * `ANTHROPIC_API_KEY`: a **new** Claude key (rotate the one you shared earlier)
4. Press **Apply**. After the build finishes you get `https://truewage-xxxx.onrender.com`.
5. Verify: open `https://<your-link>/api/health`. You should see `"ok": true, "ai": true, "db": "postgres"`.
   From your computer you can also run `python tools/smoke.py https://<your-link>`.

Notes
* The free plan **sleeps after ~15 minutes without visitors**; the first visit afterwards takes 30 to 60 seconds. Open the link a minute before a demo, or use a paid instance ($7/month) to keep it awake.
* All rider data is in Supabase, so redeploying or restarting never loses anything.
* Every `git push` to `main` redeploys automatically (`autoDeploy`).
* Other hosts work too: Railway, Fly.io or the Vultr guide in `VULTR.md`. Anything that runs `python server.py` with the same environment variables works.

## Backups and uptime alerts (GitHub, free)

Two workflows are in `.github/workflows/`:
* `uptime.yml` checks `/api/health/ready` every 10 minutes. If the site or its database is down, the run fails and GitHub e-mails you. It also keeps the free Render instance awake. To check a different address, add a repository variable `TRUEWAGE_URL`.
* `backup.yml` makes an encrypted copy of the database every night and keeps it for 14 days (Actions > backup > the latest run > Artifacts). It does nothing until you add two repository secrets (Settings > Secrets and variables > Actions): `DATABASE_URL` (the Supabase **Session pooler** string, because GitHub cannot reach the direct address) and `BACKUP_PASSPHRASE` (a long random phrase; keep a copy somewhere safe, backups cannot be opened without it).

To check a backup, download it, decrypt it and run the restore drill:

```bash
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -in truewage-YYYYMMDD.json.gz.enc -out backup.json.gz
python backup.py drill backup.json.gz
```

In the app, an admin (a phone number listed in `TRUEWAGE_ADMIN_PHONES`) sees a System panel with uptime, database speed, recent errors and a backup download button.
