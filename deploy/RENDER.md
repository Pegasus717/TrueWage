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
