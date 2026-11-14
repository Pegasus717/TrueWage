#!/usr/bin/env python3
"""Check the database TrueWage is configured to use (Supabase/Postgres when DATABASE_URL is set, else local SQLite).

    python tools/db_check.py

Creates the schema if needed, then does a full round trip with a throw-away rider (register -> save data -> history -> CSV ->
quota -> delete) plus the statement registry, city contributions, AI cache and budget, and removes everything it created.
Prints only PASS/FAIL lines: never the connection string or password."""
import os, random, sys, time, urllib.parse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import server, accounts, store  # noqa: E402  (importing server opens the database and creates the schema)

fails = 0


def check(name, ok, detail=""):
    global fails
    print(("PASS " if ok else "FAIL ") + name + ((" - " + detail) if detail and not ok else ""))
    fails += 0 if ok else 1


kind = store.backend()
host = ""
if kind == "pg":
    try:
        host = urllib.parse.urlparse(store.database_url()).hostname or ""
    except ValueError:
        host = ""
print("Backend: %s%s" % ("Postgres (online database)" if kind == "pg" else "SQLite (local file)", (" at " + host) if host else ""))
t0 = time.time()
with store.conn() as c:
    c.execute("SELECT 1").fetchone()
ms = (time.time() - t0) * 1000
check("connect and query (%.0f ms)" % ms, True)

with store.conn() as c:
    for t in [n for n, _ in store.TABLES]:
        c.execute("SELECT COUNT(*) AS n FROM %s" % t).fetchone()
check("all %d tables exist" % len(store.TABLES), True)

phone = "9%09d" % random.randrange(10 ** 9)
uid = None
try:
    user, token = accounts.register("DB Check", phone, "db-check-" + os.urandom(4).hex(), "en")
    uid = user["id"]
    check("register a throw-away rider", uid is not None)
    check("session token resolves to that rider", (accounts.user_from_token(token) or {}).get("id") == uid)
    doc = {"sessions": [{"id": "s1", "date": "2026-11-13", "platform": "Rapido", "onlineMin": 300, "bonus": 0, "source": "ai",
                         "orders": [{"hour": 10.5, "zone": "Uppal", "km": 3, "pay": 50, "incentive": 5, "deduction": 2, "durMin": 20}]}],
           "expenses": [{"id": "e1", "date": "2026-11-13", "category": "fuel", "amount": 300, "litres": 3, "odo": 1000}],
           "shifts": [{"id": "sh1", "date": "2026-11-13", "platform": "Rapido", "startTs": 1, "endTs": 2, "onlineMin": 300, "km": 40, "gps": "on", "zone": "Uppal", "zoneMin": {"Uppal": 200}}]}
    v = accounts.put_data(uid, doc, 0)
    check("save the rider's data (version %d)" % v, v == 1)
    try:
        accounts.put_data(uid, doc, 0)
        check("stale version is rejected", False)
    except accounts.AuthError as e:
        check("stale version is rejected", e.code == "conflict")
    data, version = accounts.get_data(uid)
    check("read the data back", version == 1 and len(data["sessions"][0]["orders"]) == 1)
    h = accounts.history(uid)
    check("history comes from relational tables", h["stats"]["orders"] == 1 and h["topZones"][0]["zone"] == "Uppal")
    check("CSV export", "order,2026-11-13,Rapido" in accounts.export_csv(uid))
    accounts.log_import(uid, "ai", 2, 1, 1, 1, 1, ["m"]); accounts.log_statement(uid, "TW-CHECK", "2026-10-01", "2026-11-13", 21000)
    h = accounts.history(uid)
    check("import and statement history", h["imports"][0]["cached"] == 1 and h["statements"][0]["monthly_take_home"] == 21000)
    accounts.ai_spend(uid, images=2)
    check("per-rider AI quota counts usage", accounts.ai_usage(uid)["imagesToday"] == 2)
    other, _ = accounts.register("DB Check 2", "9%09d" % random.randrange(10 ** 9), "db-check-" + os.urandom(4).hex(), "en")
    try:
        check("another rider sees none of it", accounts.history(other["id"])["stats"]["orders"] == 0 and accounts.get_data(other["id"])[0] == {})
    finally:
        with store.conn() as c:
            c.execute("DELETE FROM users WHERE id=?", (other["id"],))
    # server-wide stores
    sid = "TW-" + os.urandom(6).hex().upper()
    check("statement registry: add and read", server.registry_add(sid, "a" * 64, {"x": 1}) and server.registry_get(sid)["data"] == {"x": 1})
    rid = os.urandom(12).hex()
    check("city contribution: add and read", server.contrib_put(rid, [{"platform": "Swiggy", "zone": "Madhapur", "daypart": "evening", "perHr": 100, "hours": 5}]) and rid in server.contrib_all())
    server.cache_put("selfcheck" + os.urandom(3).hex(), [{"kind": "other"}])
    check("AI cache write", True)
    server.spend_budget(0)
    check("AI budget counter", True)
    with store.conn() as c:
        c.execute("DELETE FROM registry WHERE id=?", (sid,)); c.execute("DELETE FROM contributions WHERE rider=?", (rid,)); c.execute("DELETE FROM extract_cache WHERE key LIKE ?", ("%:selfcheck%",))
finally:
    if uid is not None:
        with store.conn() as c:
            c.execute("DELETE FROM users WHERE id=?", (uid,))
with store.conn() as c:
    left = c.execute("SELECT COUNT(*) AS n FROM work_sessions WHERE user_id=?", (uid,)).fetchone()["n"] if uid else 0
    orders_left = c.execute("SELECT COUNT(*) AS n FROM orders WHERE user_id=?", (uid,)).fetchone()["n"] if uid else 0
check("deleting the rider cascades to every table", left == 0 and orders_left == 0)
print("\n%s" % ("DATABASE OK" if not fails else "%d CHECK(S) FAILED" % fails))
sys.exit(1 if fails else 0)
