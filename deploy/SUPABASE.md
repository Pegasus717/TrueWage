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

## Where to see the users and their data in Supabase

Open **Table Editor** (left menu). The tables are in the default `public` schema:

* `users` (id, phone, name, password hash, language, created): the list of riders
* `userdata` (each rider's saved document), `work_sessions` and `orders` (days and every order), `shifts`, `expenses`
* `analytics_summary`, `analytics_days`, `analytics_slots`: each rider's computed analytics (real pay per hour, kept cash, per-day and per-area results)
* `imports` (every screenshot reading), `statements`, `events` (sign-up, login, saves, exports), `ai_usage` (per rider per day)
* `registry`, `contributions`, `extract_cache`, `ai_budget`, `kv` (server-wide)

If you used an earlier version, the tables that were in a `truewage` schema are moved into `public` automatically (data kept) the next time the server starts.

The **Authentication > Users** page of Supabase stays empty on purpose: TrueWage does its own login (phone + password, hashed with scrypt) and does not use Supabase Auth.

In the **SQL Editor** you can run, for example:

```sql
select id, name, created from truewage.users order by id;
select u.name, count(distinct w.sid) as days, count(o.*) as orders
from truewage.users u left join truewage.work_sessions w on w.user_id=u.id
left join truewage.orders o on o.user_id=u.id and o.sid=w.sid group by u.name;
```

Inside the app, set `TRUEWAGE_ADMIN_PHONES=<your 10-digit phone>` (in `.env` or Render's environment) and sign in with that number: **My account > Admin overview** lists every rider (phone masked) with their days, orders, screenshot reads and last activity, plus AI usage today.

## 3. Move existing local data (optional)

If you already have riders in the local `data/` folder:

```bash
python tools/migrate_to_db.py          # copies truewage.db, registry.json and contributions.json; safe to re-run
```

## How it is kept private

* The app connects with the database password from `DATABASE_URL`. Riders' browsers never talk to Supabase directly and the public *anon key* is never used.
* **Row Level Security is enabled on every table** with no policies, and all privileges are revoked from Supabase's `anon` and `authenticated` roles, so even the public anon key could not read or write them. The full SQL is in [supabase_schema.sql](supabase_schema.sql).
* Passwords are stored as scrypt hashes; session tokens only as SHA-256 hashes.

## Troubleshooting

| Message | Likely cause |
|---|---|
| `DATABASE_URL is set but the Postgres driver is missing` | run `pip install -r requirements.txt` |
| `password authentication failed` | wrong password, or special characters not URL-encoded |
| `could not translate host name` or timeouts | use the *Session pooler* string, not the direct `db.<ref>.supabase.co` host (IPv6 only on the free plan) |
| `prepared statement ... already exists` | you used the Transaction pooler (port 6543); switch to the Session pooler (5432) |
