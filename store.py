"""TrueWage storage layer: ONE interface, TWO backends.

  * Postgres (Supabase or any hosted Postgres) when DATABASE_URL is set  -> the real online database (needs: pip install "psycopg[binary]")
  * SQLite file (TRUEWAGE_DATA/truewage.db) otherwise                    -> zero-setup local development and tests

Everything the app persists lives here: accounts, sessions, each rider's data and history, the statement registry, the anonymous city
contributions, the AI reading cache and the AI daily budget. Nothing is kept in JSON files any more.

Application code writes SQL with '?' placeholders and standard syntax (INSERT ... ON CONFLICT, RETURNING); this module adapts it per backend.
Postgres tables live in the "public" schema (so they appear in Supabase's Table Editor). Row Level Security is enabled on every table with no
policies, and all privileges are revoked from Supabase's anon/authenticated roles, so the project's public anon key cannot read or write any of it.
Only the server's own database connection (the postgres role in DATABASE_URL) can.
"""
import contextlib, os, re, sqlite3, threading, time

SCHEMA_NAME = os.environ.get("TRUEWAGE_DB_SCHEMA", "public")      # "public" so the tables show up in the Supabase Table Editor by default
OLD_SCHEMA = "truewage"                                                  # earlier versions used this schema; its tables are moved automatically
_kind = "sqlite"
_path = None
_url = None
_pool, _pool_lock = [], threading.Lock()
_pg = None                      # the psycopg module when the Postgres backend is active
POOL_MAX = 6

# Each statement uses tokens that are replaced per backend: %ID% auto id, %REAL% float, %BIG% 64-bit integer.
TABLES = [
    ("users", "CREATE TABLE IF NOT EXISTS users(id %ID%, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pw TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en', created %BIG% NOT NULL)"),
    ("sessions", "CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires %BIG% NOT NULL)"),
    ("userdata", "CREATE TABLE IF NOT EXISTS userdata(user_id %BIG% PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, json TEXT NOT NULL, version %BIG% NOT NULL DEFAULT 0, updated %BIG% NOT NULL)"),
    ("work_sessions", "CREATE TABLE IF NOT EXISTS work_sessions(user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, sid TEXT NOT NULL, date TEXT NOT NULL, platform TEXT, zone TEXT, online_min %REAL%, bonus %REAL%, source TEXT, n_orders %BIG%, pay %REAL%, incentive %REAL%, deduction %REAL%, km %REAL%, PRIMARY KEY(user_id, sid))"),
    ("orders", "CREATE TABLE IF NOT EXISTS orders(user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, sid TEXT NOT NULL, idx %BIG% NOT NULL, hour %REAL%, zone TEXT, km %REAL%, pay %REAL%, incentive %REAL%, deduction %REAL%, dur_min %REAL%, PRIMARY KEY(user_id, sid, idx))"),
    ("shifts", "CREATE TABLE IF NOT EXISTS shifts(user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, sid TEXT NOT NULL, date TEXT, platform TEXT, start_ts %REAL%, end_ts %REAL%, online_min %REAL%, km %REAL%, gps TEXT, zone TEXT, zone_min TEXT, PRIMARY KEY(user_id, sid))"),
    ("expenses", "CREATE TABLE IF NOT EXISTS expenses(user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, eid TEXT NOT NULL, date TEXT NOT NULL, category TEXT, amount %REAL%, litres %REAL%, odo %REAL%, note TEXT, PRIMARY KEY(user_id, eid))"),
    ("imports", "CREATE TABLE IF NOT EXISTS imports(id %ID%, user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, ts %BIG% NOT NULL, reader TEXT, images %BIG%, cached %BIG%, sent %BIG%, sessions %BIG%, orders %BIG%, models TEXT)"),
    ("statements", "CREATE TABLE IF NOT EXISTS statements(user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, sid TEXT NOT NULL, ts %BIG% NOT NULL, period_from TEXT, period_to TEXT, monthly_take_home %REAL%, PRIMARY KEY(user_id, sid))"),
    ("events", "CREATE TABLE IF NOT EXISTS events(id %ID%, user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, ts %BIG% NOT NULL, kind TEXT NOT NULL, detail TEXT)"),
    ("ai_usage", "CREATE TABLE IF NOT EXISTS ai_usage(user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, images %BIG% NOT NULL DEFAULT 0, asks %BIG% NOT NULL DEFAULT 0, PRIMARY KEY(user_id, day))"),
    # server-wide stores (previously JSON files)
    ("registry", "CREATE TABLE IF NOT EXISTS registry(id TEXT PRIMARY KEY, hash TEXT NOT NULL, data TEXT, created TEXT NOT NULL)"),
    ("contributions", "CREATE TABLE IF NOT EXISTS contributions(rider TEXT PRIMARY KEY, cells TEXT NOT NULL, ts %BIG% NOT NULL)"),
    ("extract_cache", "CREATE TABLE IF NOT EXISTS extract_cache(key TEXT PRIMARY KEY, screens TEXT NOT NULL, ts %BIG% NOT NULL)"),
    ("ai_budget", "CREATE TABLE IF NOT EXISTS ai_budget(day TEXT PRIMARY KEY, images %BIG% NOT NULL DEFAULT 0)"),
    ("kv", "CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    # per-rider analytics (computed by the app's calculation engine, stored so a rider's analytics follow them and can be queried)
    ("analytics_summary", "CREATE TABLE IF NOT EXISTS analytics_summary(user_id %BIG% PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, updated %BIG% NOT NULL, from_date TEXT, to_date TEXT, days %BIG%, orders %BIG%, hours %REAL%, app_shown %REAL%, gross %REAL%, cost %REAL%, net %REAL%, per_hr %REAL%, app_per_hr %REAL%, lo_per_hr %REAL%, hi_per_hr %REAL%)"),
    ("analytics_days", "CREATE TABLE IF NOT EXISTS analytics_days(user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, date TEXT NOT NULL, orders %BIG%, hours %REAL%, app_shown %REAL%, gross %REAL%, cost %REAL%, net %REAL%, per_hr %REAL%, PRIMARY KEY(user_id, date))"),
    ("analytics_slots", "CREATE TABLE IF NOT EXISTS analytics_slots(user_id %BIG% NOT NULL REFERENCES users(id) ON DELETE CASCADE, zone TEXT NOT NULL, daypart TEXT NOT NULL, orders %BIG%, hours %REAL%, per_hr %REAL%, PRIMARY KEY(user_id, zone, daypart))"),
]
INDEXES = [
    "CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id)",
    "CREATE INDEX IF NOT EXISTS ws_date ON work_sessions(user_id, date)",
    "CREATE INDEX IF NOT EXISTS ord_zone ON orders(user_id, zone)",
    "CREATE INDEX IF NOT EXISTS exp_date ON expenses(user_id, date)",
    "CREATE INDEX IF NOT EXISTS ev_user ON events(user_id, ts)",
    "CREATE INDEX IF NOT EXISTS imp_user ON imports(user_id, id)",
    "CREATE INDEX IF NOT EXISTS cache_ts ON extract_cache(ts)",
]


def backend():
    return _kind


def database_url():
    if os.environ.get("TRUEWAGE_DB", "").lower() == "sqlite":      # force the local file (the tests do this so they never touch a hosted database)
        return ""
    return (os.environ.get("DATABASE_URL") or os.environ.get("SUPABASE_DB_URL") or "").strip()


def _ddl(sql):
    if _kind == "pg":
        return sql.replace("%ID%", "BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY").replace("%REAL%", "DOUBLE PRECISION").replace("%BIG%", "BIGINT")
    return sql.replace("%ID%", "INTEGER PRIMARY KEY AUTOINCREMENT").replace("%REAL%", "REAL").replace("%BIG%", "INTEGER")


def init(data_dir):
    """Choose the backend and create the schema (idempotent)."""
    global _kind, _path, _url, _pg
    _pool.clear()
    _url = database_url()
    if _url:
        try:
            import psycopg
            from psycopg.rows import dict_row  # noqa: F401
        except ImportError:
            raise SystemExit('DATABASE_URL is set but the Postgres driver is missing. Run:  pip install "psycopg[binary]"')
        _pg, _kind = psycopg, "pg"
    else:
        _kind = "sqlite"
        os.makedirs(data_dir, exist_ok=True)
        _path = os.path.join(data_dir, "truewage.db")
    with conn() as c:
        if _kind == "pg":
            if SCHEMA_NAME != "public":
                c.execute("CREATE SCHEMA IF NOT EXISTS %s" % SCHEMA_NAME)
            c.execute("SET search_path TO %s" % SCHEMA_NAME)
            if SCHEMA_NAME != OLD_SCHEMA:                      # move tables (with their data, keys and indexes) out of the old schema
                moved = False
                for r in c.execute("SELECT table_name FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE'", (OLD_SCHEMA,)).fetchall():
                    t = r["table_name"]
                    if c.execute("SELECT 1 FROM information_schema.tables WHERE table_schema=? AND table_name=?", (SCHEMA_NAME, t)).fetchone() is None:
                        c.execute("ALTER TABLE %s.%s SET SCHEMA %s" % (OLD_SCHEMA, t, SCHEMA_NAME))
                        moved = True
                if moved:
                    c.execute("DO $$ BEGIN DROP SCHEMA %s; EXCEPTION WHEN others THEN NULL; END $$" % OLD_SCHEMA)
        for _, sql in TABLES:
            c.execute(_ddl(sql))
        for sql in INDEXES:
            c.execute(sql)
        if _kind == "pg":
            for name, _ in TABLES:                       # nobody but the server's own connection may touch these tables
                c.execute("ALTER TABLE %s.%s ENABLE ROW LEVEL SECURITY" % (SCHEMA_NAME, name))
                c.execute("DO $$ BEGIN REVOKE ALL ON TABLE %s.%s FROM anon, authenticated; EXCEPTION WHEN undefined_object THEN NULL; END $$" % (SCHEMA_NAME, name))
        c.execute("DELETE FROM sessions WHERE expires < ?", (int(time.time()),))
    return _kind


# ---------------- connections ----------------
class Conn:
    """Thin wrapper: '?' placeholders everywhere, dict-like rows, and the few operations that differ between backends."""
    def __init__(self, raw, kind):
        self.raw, self.kind = raw, kind
        self.for_update = " FOR UPDATE" if kind == "pg" else ""

    def execute(self, sql, params=()):
        if self.kind == "pg":
            sql = sql.replace("%", "%%").replace("?", "%s")
        return self.raw.execute(sql, params)

    def executemany(self, sql, seq):
        if self.kind == "pg":
            sql = sql.replace("%", "%%").replace("?", "%s")
            cur = self.raw.cursor()
            cur.executemany(sql, list(seq))
            return cur
        return self.raw.executemany(sql, seq)

    def begin_write(self):
        """Start a write transaction that serialises with other writers (SQLite: BEGIN IMMEDIATE; Postgres: row locks via for_update)."""
        if self.kind == "sqlite":
            self.raw.execute("BEGIN IMMEDIATE")


def _dead(raw):
    return raw.closed or getattr(raw, "broken", False)


def _connect_pg():
    c = _pg.connect(_url, connect_timeout=10, row_factory=_pg.rows.dict_row, prepare_threshold=None)   # no prepared statements: works behind poolers
    c.execute("SET search_path TO %s" % SCHEMA_NAME)
    c.commit()
    return c


@contextlib.contextmanager
def conn():
    if _kind == "pg":
        raw = None
        with _pool_lock:
            while _pool:
                cand, last = _pool.pop()
                if _dead(cand):
                    continue
                if time.time() - last > 20:               # idle a while: make sure the server did not drop it
                    try:
                        cand.execute("SELECT 1"); cand.rollback()
                    except Exception:
                        try:
                            cand.close()
                        except Exception:
                            pass
                        continue
                raw = cand
                break
        if raw is None:
            raw = _connect_pg()
        c = Conn(raw, "pg")
        try:
            yield c
            raw.commit()
        except BaseException:
            try:
                raw.rollback()
            except Exception:
                pass
            raise
        finally:                                          # no 'return' here: it would swallow an in-flight exception
            pooled = False
            if not _dead(raw):
                with _pool_lock:
                    if len(_pool) < POOL_MAX:
                        _pool.append((raw, time.time()))
                        pooled = True
            if not pooled:
                try:
                    raw.close()
                except Exception:
                    pass
    else:
        raw = sqlite3.connect(_path, timeout=10)
        raw.row_factory = sqlite3.Row
        raw.execute("PRAGMA foreign_keys=ON")
        try:
            yield Conn(raw, "sqlite")
            raw.commit()
        finally:
            raw.close()


def integrity_errors():
    """Exception classes meaning 'unique constraint violated' for the active backend."""
    if _kind == "pg":
        return (_pg.errors.UniqueViolation,)
    return (sqlite3.IntegrityError,)


def upsert_sql(table, cols, pk):
    """Portable INSERT ... ON CONFLICT DO UPDATE for a row given as positional '?' values."""
    upd = ", ".join("%s=excluded.%s" % (c, c) for c in cols if c not in pk)
    return "INSERT INTO %s(%s) VALUES(%s) ON CONFLICT(%s) DO %s" % (table, ",".join(cols), ",".join("?" * len(cols)), ",".join(pk),
                                                                     "UPDATE SET " + upd if upd else "NOTHING")


def kv_get(key, default=None):
    with conn() as c:
        r = c.execute("SELECT v FROM kv WHERE k=?", (key,)).fetchone()
    return r["v"] if r else default


def kv_set_if_absent(key, value):
    """Store a value only if the key is new, and return the value that is stored (safe if two servers start at once)."""
    with conn() as c:
        c.execute("INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO NOTHING", (key, value))
        return c.execute("SELECT v FROM kv WHERE k=?", (key,)).fetchone()["v"]
