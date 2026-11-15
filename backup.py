"""TrueWage backups: dump the whole database to one file, check it, and restore it. Python standard library only.

  python backup.py dump [--out FILE]        write a gzip'd JSON dump of every table (default name: truewage-backup-<UTC time>.json.gz)
  python backup.py verify FILE              check the file is a complete, well-formed dump and print what is in it
  python backup.py drill FILE               the restore drill: load the dump into a throw-away SQLite database and compare every table's row count
  python backup.py restore FILE [--replace] load the dump into the ACTIVE database (refuses if riders already exist unless --replace)
  python backup.py snapshot [--out FILE]    SQLite only: consistent copy of the database file using SQLite's online backup

What is saved: every table except login sessions (riders just sign in again) and the AI reading cache (rebuilt on demand).
What a dump contains: rider accounts with their password and recovery-code HASHES, phone numbers and earnings records. Treat the file like the
database itself: keep it private, and encrypt it before it goes anywhere shared (the scheduled GitHub workflow does).

The active database is chosen exactly as for the server: DATABASE_URL (Postgres) if set, else TRUEWAGE_DATA/truewage.db (SQLite).
"""
import argparse, contextlib, gzip, json, os, sqlite3, sys, tempfile, threading, time

ROOT = os.path.dirname(os.path.abspath(__file__))
FORMAT = 1
SKIP = {"sessions", "extract_cache", "schema_migrations", "error_log"}      # logins, a cache, the target database's own migration record, operational errors


def _load_dotenv():
    p = os.path.join(ROOT, ".env")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                if not os.environ.get(k.strip(), "").strip():
                    os.environ[k.strip()] = v.strip().strip('"').strip("'")


def _store():
    import store
    return store


def tables():
    return [name for name, _ in _store().TABLES if name not in SKIP]


def _columns(c, table):
    cur = c.execute("SELECT * FROM %s LIMIT 0" % table)
    return [d[0] for d in cur.description]


def dump():
    """Read every table inside one transaction-consistent connection. Returns the dump as a dict."""
    st = _store()
    out = {"app": "truewage-backup", "format": FORMAT, "created": int(time.time()), "backend": st.backend(), "schema": st.schema_version(), "tables": {}, "counts": {}}
    with st.conn() as c:
        if st.backend() == "pg":
            c.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")       # one snapshot across all tables
        for name in tables():
            cols = _columns(c, name)
            rows = [[r[k] for k in cols] for r in c.execute("SELECT %s FROM %s" % (",".join(cols), name)).fetchall()]
            out["tables"][name] = {"columns": cols, "rows": rows}
            out["counts"][name] = len(rows)
    return out


def encode(d):
    return gzip.compress(json.dumps(d, separators=(",", ":"), default=str).encode("utf-8"), 6)


def decode(blob):
    try:
        d = json.loads(gzip.decompress(blob).decode("utf-8"))
    except Exception:
        raise ValueError("not a TrueWage backup (cannot read it as gzip'd JSON)")
    check(d)
    return d


def check(d):
    """Structural validation. Raises ValueError with the reason."""
    if not isinstance(d, dict) or d.get("app") != "truewage-backup" or d.get("format") != FORMAT:
        raise ValueError("not a TrueWage backup, or a newer format than this program understands")
    known = set(tables())
    if not isinstance(d.get("tables"), dict) or not isinstance(d.get("counts"), dict):
        raise ValueError("missing tables")
    if "users" not in d["tables"]:
        raise ValueError("the dump has no users table")
    for name, t in d["tables"].items():
        if name not in known:
            raise ValueError("unknown table in dump: %s" % name)
        if not isinstance(t, dict) or not isinstance(t.get("columns"), list) or not isinstance(t.get("rows"), list):
            raise ValueError("table %s is malformed" % name)
        if len(t["rows"]) != d["counts"].get(name):
            raise ValueError("table %s: the file holds %d rows but its header says %s (truncated or edited?)" % (name, len(t["rows"]), d["counts"].get(name)))
        if any(not isinstance(r, list) or len(r) != len(t["columns"]) for r in t["rows"]):
            raise ValueError("table %s has a row with the wrong number of values" % name)
    return True


def write(path, d=None):
    d = d or dump()
    with open(path, "wb") as f:
        f.write(encode(d))
    try:
        with _store().conn() as c:
            c.execute("INSERT INTO kv(k,v) VALUES('last_backup',?) ON CONFLICT(k) DO UPDATE SET v=excluded.v", (str(int(d["created"])),))
    except Exception:
        pass
    return d


def restore(d, replace=False):
    """Load a dump into the active database. Column names are checked against the live schema, never trusted. One transaction: all or nothing."""
    check(d)
    st = _store()
    order = [t for t in tables() if t in d["tables"]]
    with st.conn() as c:
        if st.backend() == "pg":
            c.execute("SELECT pg_advisory_xact_lock(7272002)")
        if c.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"] and not replace:
            raise ValueError("the database already has riders; restore only into an empty one, or pass --replace to overwrite it")
        if replace:
            for name in reversed(order):
                c.execute("DELETE FROM %s" % name)
        elif "kv" in d["tables"]:
            c.execute("DELETE FROM kv")                          # a new database has already made its own secret; the dump's one replaces it
        for name in order:
            t = d["tables"][name]
            live = _columns(c, name)
            bad = [k for k in t["columns"] if k not in live]
            if bad:
                raise ValueError("table %s: the dump has columns this database does not: %s" % (name, ", ".join(bad)))
            if t["rows"]:
                c.executemany("INSERT INTO %s(%s) VALUES(%s)" % (name, ",".join(t["columns"]), ",".join("?" * len(t["columns"]))), t["rows"])
        if st.backend() == "pg":                                      # explicit ids were inserted: move each identity sequence past them
            for name in order:
                if "id" in _columns(c, name) and name in ("users", "imports", "events", "review_stats"):
                    c.execute("SELECT setval(pg_get_serial_sequence('%s','id'), COALESCE((SELECT MAX(id) FROM %s), 1), (SELECT MAX(id) FROM %s) IS NOT NULL)" % (name, name, name))
    return {name: len(d["tables"][name]["rows"]) for name in order}


def drill(d):
    """The restore drill. Loads the dump into a brand-new SQLite database in a temporary folder (never the live one) and compares row counts.
    Runs in this process only if the active backend is already a throw-away one; otherwise use `python backup.py drill FILE`, which isolates it."""
    st = _store()
    with tempfile.TemporaryDirectory() as tmp:
        saved = (st._kind, st._path, st._url, st._pg, list(st._pool))
        old_env = os.environ.get("TRUEWAGE_DB")
        try:
            os.environ["TRUEWAGE_DB"] = "sqlite"
            st.init(tmp)
            got = restore(d)
            with st.conn() as c:
                live = {name: c.execute("SELECT COUNT(*) AS n FROM %s" % name).fetchone()["n"] for name in got}
        finally:
            st._kind, st._path, st._url, st._pg = saved[:4]
            st._pool[:] = saved[4]
            if old_env is None:
                os.environ.pop("TRUEWAGE_DB", None)
            else:
                os.environ["TRUEWAGE_DB"] = old_env
    want = {name: d["counts"][name] for name in got}
    return {"ok": live == want, "want": want, "got": live}


def snapshot_sqlite(dest):
    st = _store()
    if st.backend() != "sqlite":
        raise ValueError("snapshot is for the SQLite backend; use `dump` for Postgres")
    src, dst = sqlite3.connect(st._path), sqlite3.connect(dest)
    try:
        src.backup(dst)
    finally:
        dst.close(); src.close()
    return dest


def rotate(folder, keep, prefix="truewage-backup-"):
    """Keep the newest `keep` backup files in a folder and delete the rest. Only files this program names are ever touched."""
    names = sorted(n for n in os.listdir(folder) if n.startswith(prefix) and (n.endswith(".json.gz") or n.endswith(".db")))
    gone = names[:-keep] if keep > 0 else names
    for n in gone:
        with contextlib.suppress(OSError):
            os.remove(os.path.join(folder, n))
    return gone


def stamp():
    return time.strftime("%Y%m%d-%H%M%S", time.gmtime())


def run_once(folder, keep):
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "truewage-backup-%s.json.gz" % stamp())
    d = write(path)
    rotate(folder, keep)
    return path, d["counts"]


def start_scheduler(data_dir):
    """Background thread: a backup every TRUEWAGE_BACKUP_EVERY_H hours (default 24), keeping TRUEWAGE_BACKUP_KEEP files (default 7).
    On by default for the SQLite backend (the data is on this disk anyway). With Postgres it needs TRUEWAGE_BACKUP_DIR to be set, because the
    hosted database already lives elsewhere and copying every rider's data onto the web server's disk should be a deliberate choice."""
    st = _store()
    folder = os.environ.get("TRUEWAGE_BACKUP_DIR") or (os.path.join(data_dir, "backups") if st.backend() == "sqlite" else "")
    every = float(os.environ.get("TRUEWAGE_BACKUP_EVERY_H", "24"))
    if not folder or every <= 0:
        return None
    keep = int(os.environ.get("TRUEWAGE_BACKUP_KEEP", "7"))

    def loop():
        time.sleep(90)                                               # let the server settle after a restart
        while True:
            try:
                last = st.kv_get("last_backup")
                if not last or time.time() - float(last) >= every * 3600 - 60:
                    path, counts = run_once(folder, keep)
                    print("backup written:", os.path.basename(path), sum(counts.values()), "rows")
            except Exception as e:
                sys.stderr.write("backup failed: %s\n" % type(e).__name__)
            time.sleep(1800)

    th = threading.Thread(target=loop, daemon=True, name="backup")
    th.start()
    return th


def last_backup():
    try:
        v = _store().kv_get("last_backup")
        return int(float(v)) if v else None
    except Exception:
        return None


def main(argv=None):
    ap = argparse.ArgumentParser(description="TrueWage backup, verify, drill and restore")
    ap.add_argument("cmd", choices=["dump", "verify", "drill", "restore", "snapshot"])
    ap.add_argument("file", nargs="?")
    ap.add_argument("--out")
    ap.add_argument("--replace", action="store_true")
    a = ap.parse_args(argv)
    _load_dotenv()
    if a.cmd in ("verify", "drill"):
        os.environ["TRUEWAGE_DB"] = "sqlite"                         # these never need (or touch) the live database
        os.environ.setdefault("TRUEWAGE_DATA", tempfile.mkdtemp())
    data_dir = os.environ.get("TRUEWAGE_DATA", os.path.join(ROOT, "data"))
    st = _store()
    st.init(data_dir)
    try:
        if a.cmd == "dump":
            path = a.out or os.path.join(os.getcwd(), "truewage-backup-%s.json.gz" % stamp())
            d = write(path)
            print("wrote %s (%d bytes, %s backend, schema v%s)" % (path, os.path.getsize(path), d["backend"], d["schema"]))
            for k, n in d["counts"].items():
                print("  %-18s %d" % (k, n))
        elif a.cmd == "snapshot":
            dest = a.out or os.path.join(data_dir, "backups", "truewage-backup-%s.db" % stamp())
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            print("wrote", snapshot_sqlite(dest))
        else:
            if not a.file:
                ap.error("this command needs a backup file")
            d = decode(open(a.file, "rb").read())
            if a.cmd == "verify":
                print("OK: %s, made %s UTC, schema v%s, %s rows in %d tables" % (os.path.basename(a.file), time.strftime("%Y-%m-%d %H:%M", time.gmtime(d["created"])), d["schema"], sum(d["counts"].values()), len(d["counts"])))
            elif a.cmd == "drill":
                r = drill(d)
                print("restore drill:", "PASSED" if r["ok"] else "FAILED")
                for k in r["want"]:
                    print("  %-18s dump %-7d restored %d %s" % (k, r["want"][k], r["got"].get(k, -1), "" if r["want"][k] == r["got"].get(k) else "<-- MISMATCH"))
                return 0 if r["ok"] else 1
            else:
                counts = restore(d, replace=a.replace)
                print("restored %d rows into the %s database. Restart the server so it picks up the restored secrets." % (sum(counts.values()), st.backend()))
    except ValueError as e:
        sys.stderr.write("error: %s\n" % e)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
