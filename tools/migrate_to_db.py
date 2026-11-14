#!/usr/bin/env python3
"""Copy an existing local TrueWage database (SQLite file + the old JSON files) into the database named by DATABASE_URL.

    python tools/migrate_to_db.py [path/to/data-folder]        (default: ./data)

Safe to re-run: rows are upserted by primary key. Does nothing when DATABASE_URL is not set (the target would be the same SQLite file)."""
import json, os, sqlite3, sys, time
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
src_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
os.environ.pop("TRUEWAGE_DB", None)
import store  # noqa: E402
import server  # noqa: E402  (opens the target and creates the schema)

if store.backend() != "pg":
    sys.exit("DATABASE_URL is not set: nothing to migrate to. Put your Supabase connection string in .env first.")
db_file = os.path.join(src_dir, "truewage.db")
n_rows = 0
if os.path.exists(db_file):
    src = sqlite3.connect(db_file); src.row_factory = sqlite3.Row
    pks = {"users": ["id"], "sessions": ["token_hash"], "userdata": ["user_id"], "work_sessions": ["user_id", "sid"], "orders": ["user_id", "sid", "idx"], "shifts": ["user_id", "sid"],
           "expenses": ["user_id", "eid"], "imports": ["id"], "statements": ["user_id", "sid"], "events": ["id"], "ai_usage": ["user_id", "day"]}
    have = {r[0] for r in src.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    with store.conn() as c:
        for t, pk in pks.items():                       # parents first (users), so foreign keys hold
            if t not in have:
                continue
            rows = src.execute("SELECT * FROM %s" % t).fetchall()
            if not rows:
                continue
            cols = rows[0].keys()
            sql = store.upsert_sql(t, list(cols), pk)
            c.executemany(sql, [tuple(r[k] for k in cols) for r in rows])
            n_rows += len(rows)
            print("  %-14s %d rows" % (t, len(rows)))
        for t in ("users", "imports", "events"):         # identity columns must continue after the largest copied id
            c.execute("SELECT setval(pg_get_serial_sequence('%s','id'), COALESCE((SELECT MAX(id) FROM %s), 1))" % (t, t))
        if "secret.key" in os.listdir(src_dir):
            seed = open(os.path.join(src_dir, "secret.key")).read().strip()
            c.execute("INSERT INTO kv(k, v) VALUES('secret', ?) ON CONFLICT(k) DO NOTHING", (seed,))
    print("Copied %d database rows from %s" % (n_rows, db_file))
else:
    print("No local database file at %s (skipping accounts)" % db_file)
for name, fn in (("registry.json", lambda d: [server.registry_add(k, v["hash"], v.get("data")) for k, v in d.items()]),
                 ("contributions.json", lambda d: [server.contrib_put(k, v["cells"]) for k, v in d.items()])):
    path = os.path.join(src_dir, name)
    if os.path.exists(path):
        try:
            d = json.load(open(path, encoding="utf-8"))
            fn(d)
            print("  %-20s %d entries" % (name, len(d)))
        except (OSError, ValueError, KeyError) as e:
            print("  %s skipped: %s" % (name, e))
print("Done. Run  python tools/db_check.py  to verify.")
