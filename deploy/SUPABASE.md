# Using Supabase (online Postgres) with TrueWage

TrueWage keeps **all** persistent data in a database: accounts, sessions, every rider's data and history, the income-statement registry, anonymous city analytics, the AI reading cache and the AI budget. Point it at Supabase and none of that lives on the app server or in the browser.

## 1. Create the project (about 5 minutes)

1. Sign in at supabase.com and choose **New project**. Pick the region closest to your riders (for India, Mumbai if offered, otherwise Singapore). Save the **database password** you choose.
2. Open the project, click **Connect** (top bar) and copy the **Session pooler** connection string. It looks like:
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`
   Use the *Session pooler* (works over IPv4 and keeps session settings). Do not use the *Transaction pooler* (port 6543).
3. Replace `[YOUR-PASSWORD]` with your password. If it contains special characters, URL-encode them (`@` becomes `%40`, `#` becomes `%23`).

## 2. Configure and verify

```bash
pip install -r requirements.txt        # installs the Postgres driver (psycopg)
```

Put the string in `.env` (never commit it, never paste it in chat or an issue):

```
DATABASE_URL=postgresql://postgres.xxxx:yourpassword@aws-0-ap-south-1.pooler.supabase.com:5432/postgres
```

```bash
python tools/db_check.py               # prints PASS/FAIL lines, never the password
python server.py                       # GET /api/health now reports "db": "postgres"
```

`db_check.py` creates the tables, registers a throw-away rider, saves data, reads history and the CSV, checks the quota, the statement registry, city contributions and cascade deletion, and then removes everything it created.

## 3. Move existing local data (optional)

If you already have riders in the local `data/` folder:

```bash
python tools/migrate_to_db.py          # copies truewage.db, registry.json and contributions.json; safe to re-run
```

## How it is kept private

* The app connects with the database password from `DATABASE_URL`. Riders' browsers never talk to Supabase directly and the public *anon key* is never used.
* Tables are created in their own schema (`truewage`), which Supabase does not expose through its auto-generated REST API, and **Row Level Security is enabled on every table** with no policies, so even the anon key could not read or write them. The full SQL is in [supabase_schema.sql](supabase_schema.sql).
* Passwords are stored as scrypt hashes; session tokens only as SHA-256 hashes.

## Troubleshooting

| Message | Likely cause |
|---|---|
| `DATABASE_URL is set but the Postgres driver is missing` | run `pip install -r requirements.txt` |
| `password authentication failed` | wrong password, or special characters not URL-encoded |
| `could not translate host name` or timeouts | use the *Session pooler* string, not the direct `db.<ref>.supabase.co` host (IPv6 only on the free plan) |
| `prepared statement ... already exists` | you used the Transaction pooler (port 6543); switch to the Session pooler (5432) |
