"""TrueWage accounts: per-rider login and private dashboards. Python standard library only (sqlite3, hashlib.scrypt).

Security model
  * Passwords: scrypt (N=2^14, r=8, p=1) with a random 16-byte salt per user; compared in constant time; never logged.
  * Sessions: 32-byte random token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 is stored server-side; 30-day expiry.
  * Login throttling: 5 failures per phone+IP per 15 minutes, 30 per IP; unknown phones cost the same hashing time as known ones.
  * Each rider's data lives in their own row and is only ever read through their own session (no user id is accepted from the client).
  * No SMS or e-mail is sent: this is phone-number + password sign-in. A forgotten password cannot be recovered (documented).

Data model
  * userdata   one versioned JSON document per rider: what the browser syncs (source of truth for the app, optimistic concurrency).
  * work_sessions, orders, shifts, expenses   a relational mirror of that document, rewritten inside the same transaction whenever the
               matching part changes, so the rider's history can be queried, exported and audited with plain SQL.
  * imports    one row per screenshot-reading request (reader, images, cache hits, what was found).
  * statements one row per income statement the rider created.   events   a small activity log (sign-up, login, import, export ...).
  * ai_usage   images read per rider per day (the per-rider AI quota).
"""
import contextlib, csv, hashlib, hmac, io, json, os, re, secrets, sqlite3, threading, time
from collections import defaultdict, deque

SESSION_DAYS = 30
MAX_DATA_BYTES = 3 * 1024 * 1024
LANGS = {"en", "hi", "te", "ta"}
CITIES = {"Hyderabad", "Bengaluru"}
VEHICLES = {"petrol", "ev", "cng", "car"}
PROFILE_KEYS = {"mileage", "fuelPrice", "maintPerKm", "deadKm", "dataPerHour", "fixedPerDay", "minWage", "fuelPerKmOverride"}
FLAGS = {"shared", "vehicleOk", "tourDone", "big", "demo"}
EXPENSE_CATS = {"fuel", "parking_toll", "fine", "repair", "other"}
AI_USER_DAILY = int(os.environ.get("TRUEWAGE_AI_USER_DAILY", "60"))      # images one rider may have read by AI per day
AI_USER_ASKS = int(os.environ.get("TRUEWAGE_AI_USER_ASKS", "100"))        # Ask questions per rider per day      # images one rider may have read by AI per day

_db_path = None
_lock = threading.Lock()
_fails = defaultdict(deque)
_DUMMY = None


class AuthError(Exception):
    def __init__(self, code, status=400, retry=None):
        super().__init__(code)
        self.code, self.status, self.retry = code, status, retry


def init(data_dir):
    global _db_path, _DUMMY
    os.makedirs(data_dir, exist_ok=True)
    _db_path = os.path.join(data_dir, "truewage.db")
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
            pw TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en', created INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS userdata(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, json TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 0, updated INTEGER NOT NULL);
        CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
        CREATE TABLE IF NOT EXISTS work_sessions(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, sid TEXT NOT NULL, date TEXT NOT NULL, platform TEXT,
            zone TEXT, online_min REAL, bonus REAL, source TEXT, n_orders INTEGER, pay REAL, incentive REAL, deduction REAL, km REAL, PRIMARY KEY(user_id, sid));
        CREATE TABLE IF NOT EXISTS orders(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, sid TEXT NOT NULL, idx INTEGER NOT NULL, hour REAL, zone TEXT,
            km REAL, pay REAL, incentive REAL, deduction REAL, dur_min REAL, PRIMARY KEY(user_id, sid, idx));
        CREATE TABLE IF NOT EXISTS shifts(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, sid TEXT NOT NULL, date TEXT, platform TEXT, start_ts REAL, end_ts REAL,
            online_min REAL, km REAL, gps TEXT, zone TEXT, zone_min TEXT, PRIMARY KEY(user_id, sid));
        CREATE TABLE IF NOT EXISTS expenses(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, eid TEXT NOT NULL, date TEXT NOT NULL, category TEXT, amount REAL,
            litres REAL, odo REAL, note TEXT, PRIMARY KEY(user_id, eid));
        CREATE TABLE IF NOT EXISTS imports(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, ts INTEGER NOT NULL,
            reader TEXT, images INTEGER, cached INTEGER, sent INTEGER, sessions INTEGER, orders INTEGER, models TEXT);
        CREATE TABLE IF NOT EXISTS statements(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, sid TEXT NOT NULL, ts INTEGER NOT NULL, period_from TEXT, period_to TEXT,
            monthly_take_home REAL, PRIMARY KEY(user_id, sid));
        CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, ts INTEGER NOT NULL, kind TEXT NOT NULL, detail TEXT);
        CREATE TABLE IF NOT EXISTS ai_usage(user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, images INTEGER NOT NULL DEFAULT 0, asks INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY(user_id, day));
        CREATE INDEX IF NOT EXISTS ws_date ON work_sessions(user_id, date);
        CREATE INDEX IF NOT EXISTS ord_zone ON orders(user_id, zone);
        CREATE INDEX IF NOT EXISTS exp_date ON expenses(user_id, date);
        CREATE INDEX IF NOT EXISTS ev_user ON events(user_id, ts);
        """)
        c.execute("DELETE FROM sessions WHERE expires < ?", (int(time.time()),))
    _DUMMY = hash_password("dummy-password-for-timing")
    secret_path = os.path.join(data_dir, "secret.key")
    if not os.path.exists(secret_path):
        with open(secret_path, "w") as f:
            f.write(secrets.token_hex(32))
        try:
            os.chmod(secret_path, 0o600)
        except OSError:
            pass
    with open(secret_path) as f:
        globals()["_SECRET"] = bytes.fromhex(f.read().strip())


@contextlib.contextmanager
def _conn():
    c = sqlite3.connect(_db_path, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    try:
        yield c
        c.commit()
    finally:
        c.close()


# ---------------- passwords ----------------
def hash_password(pw):
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024)
    return "scrypt$%s$%s" % (salt.hex(), h.hex())


def verify_password(pw, stored):
    try:
        _, salt, h = stored.split("$")
        calc = hashlib.scrypt(pw.encode(), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32, maxmem=64 * 1024 * 1024)
        return hmac.compare_digest(calc, bytes.fromhex(h))
    except (ValueError, TypeError):
        return False


# ---------------- validation ----------------
def norm_phone(p):
    p = re.sub(r"[\s\-()]", "", str(p or ""))
    p = re.sub(r"^(\+91|91|0)(?=\d{10}$)", "", p)
    if not re.fullmatch(r"[6-9]\d{9}", p):
        raise AuthError("bad_phone")
    return p


def clean_name(n):
    n = re.sub(r"[\x00-\x1f<>]", "", str(n or "")).strip()
    if not 1 <= len(n) <= 60:
        raise AuthError("bad_name")
    return n


def check_password(pw):
    if not isinstance(pw, str) or not 8 <= len(pw) <= 128:
        raise AuthError("bad_password")
    return pw


def public(u):
    return {"id": u["id"], "name": u["name"], "phone4": u["phone"][-4:], "phoneMasked": "XXXXXX" + u["phone"][-4:], "lang": u["lang"]}


# ---------------- sessions ----------------
def _new_session(c, user_id):
    token = secrets.token_urlsafe(32)
    c.execute("INSERT INTO sessions(token_hash, user_id, expires) VALUES(?,?,?)",
              (hashlib.sha256(token.encode()).hexdigest(), user_id, int(time.time()) + SESSION_DAYS * 86400))
    return token


def user_from_token(token):
    if not token:
        return None
    with _conn() as c:
        row = c.execute("SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash=? AND s.expires>?",
                        (hashlib.sha256(token.encode()).hexdigest(), int(time.time()))).fetchone()
        return dict(row) if row else None


def logout(token):
    if token:
        with _conn() as c:
            c.execute("DELETE FROM sessions WHERE token_hash=?", (hashlib.sha256(token.encode()).hexdigest(),))


# ---------------- register / login ----------------
def register(name, phone, password, lang):
    name, phone, password = clean_name(name), norm_phone(phone), check_password(password)
    lang = lang if lang in LANGS else "en"
    pw = hash_password(password)
    with _conn() as c:
        try:
            cur = c.execute("INSERT INTO users(phone,name,pw,lang,created) VALUES(?,?,?,?,?)", (phone, name, pw, lang, int(time.time())))
        except sqlite3.IntegrityError:
            raise AuthError("phone_exists", 409)
        uid = cur.lastrowid
        c.execute("INSERT INTO userdata(user_id,json,version,updated) VALUES(?,?,0,?)", (uid, "{}", int(time.time())))
        token = _new_session(c, uid)
        c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (uid, int(time.time()), "register", None))
        return dict(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()), token


def _throttled(key_phone, ip):
    now = time.time()
    with _lock:
        for k in (("p", key_phone, ip), ("i", ip)):
            q = _fails[k]
            while q and now - q[0] > 900:
                q.popleft()
        if len(_fails[("p", key_phone, ip)]) >= 5:
            return int(900 - (now - _fails[("p", key_phone, ip)][0])) + 1
        if len(_fails[("i", ip)]) >= 30:
            return int(900 - (now - _fails[("i", ip)][0])) + 1
    return 0


def login(phone, password, ip):
    try:
        phone = norm_phone(phone)
    except AuthError:
        raise AuthError("bad_credentials", 401)
    if not isinstance(password, str) or not password or len(password) > 128:
        raise AuthError("bad_credentials", 401)
    wait = _throttled(phone, ip)
    if wait:
        raise AuthError("locked", 429, wait)
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        ok = verify_password(password, row["pw"] if row else _DUMMY) and row is not None   # same work either way
        if not ok:
            with _lock:
                _fails[("p", phone, ip)].append(time.time())
                _fails[("i", ip)].append(time.time())
            raise AuthError("bad_credentials", 401)
        with _lock:
            _fails.pop(("p", phone, ip), None)
        c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (row["id"], int(time.time()), "login", None))
        return dict(row), _new_session(c, row["id"])


def change_password(user_id, old, new, keep_token):
    check_password(new)
    with _conn() as c:
        row = c.execute("SELECT pw FROM users WHERE id=?", (user_id,)).fetchone()
        if not row or not isinstance(old, str) or not verify_password(old, row["pw"]):
            raise AuthError("bad_credentials", 401)
        c.execute("UPDATE users SET pw=? WHERE id=?", (hash_password(new), user_id))
        c.execute("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", (user_id, hashlib.sha256((keep_token or "").encode()).hexdigest()))


def delete_account(user_id, password):
    with _conn() as c:
        row = c.execute("SELECT pw FROM users WHERE id=?", (user_id,)).fetchone()
        if not row or not isinstance(password, str) or not verify_password(password, row["pw"]):
            raise AuthError("bad_credentials", 401)
        c.execute("DELETE FROM users WHERE id=?", (user_id,))     # cascades to sessions and data


def set_lang(user_id, lang):
    if lang in LANGS:
        with _conn() as c:
            c.execute("UPDATE users SET lang=? WHERE id=?", (lang, user_id))


# ---------------- per-user data ----------------
def _num(v, lo, hi, default=0.0):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return default if x != x else max(lo, min(hi, x))


def _str(v, n, default=""):
    return re.sub(r"[\x00-\x1f]", " ", str(v if v is not None else default))[:n]


def _clean_zonemin(z):
    if not isinstance(z, dict):
        return {}
    return {_str(k, 40): _num(v, 0, 1440) for k, v in list(z.items())[:20]}


def clean_userdata(d):
    """Coerce whatever the browser sends into the schema the app uses. Wrong types are rejected, numbers are clamped."""
    if not isinstance(d, dict):
        raise AuthError("bad_data")
    out = {}
    if "sessions" in d:
        if not isinstance(d["sessions"], list) or len(d["sessions"]) > 5000:
            raise AuthError("bad_data")
        sess = []
        for s in d["sessions"]:
            if not isinstance(s, dict) or not isinstance(s.get("orders"), list) or len(s["orders"]) > 500 or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(s.get("date", ""))):
                raise AuthError("bad_data")
            orders = [{"hour": _num(o.get("hour"), -1, 30), "zone": _str(o.get("zone"), 40, "Unknown"), "km": _num(o.get("km"), 0, 300), "pay": _num(o.get("pay"), 0, 20000),
                       "incentive": _num(o.get("incentive"), 0, 20000), "deduction": _num(o.get("deduction"), 0, 20000), "durMin": _num(o.get("durMin"), 0, 600)}
                      for o in s["orders"] if isinstance(o, dict)]
            sess.append({"id": _str(s.get("id"), 60), "date": s["date"], "platform": _str(s.get("platform"), 30, "Unknown"), "zone": _str(s.get("zone"), 40) or None,
                         "onlineMin": _num(s.get("onlineMin"), 0, 1440), "bonus": _num(s.get("bonus"), 0, 20000), "source": _str(s.get("source"), 20), "orders": orders})
        out["sessions"] = sess
    if "shifts" in d:
        if not isinstance(d["shifts"], list) or len(d["shifts"]) > 400:
            raise AuthError("bad_data")
        out["shifts"] = [{"id": _str(x.get("id"), 60), "date": _str(x.get("date"), 10), "platform": _str(x.get("platform"), 30, "Unknown"), "startTs": _num(x.get("startTs"), 0, 4e12),
                          "endTs": _num(x.get("endTs"), 0, 4e12), "onlineMin": _num(x.get("onlineMin"), 0, 1440), "km": _num(x.get("km"), 0, 1000),
                          "gps": "on" if x.get("gps") == "on" else "off", "source": _str(x.get("source"), 20),
                          "zone": _str(x.get("zone"), 40) or None, "zoneMin": _clean_zonemin(x.get("zoneMin"))}
                         for x in d["shifts"] if isinstance(x, dict) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(x.get("date", "")))]
    if "expenses" in d:
        if not isinstance(d["expenses"], list) or len(d["expenses"]) > 3000:
            raise AuthError("bad_data")
        out["expenses"] = [{"id": _str(x.get("id"), 40), "date": x["date"], "category": x.get("category") if x.get("category") in EXPENSE_CATS else "other",
                            "amount": _num(x.get("amount"), 0, 500000), "litres": _num(x.get("litres"), 0, 500), "odo": _num(x.get("odo"), 0, 10000000),
                            "note": _str(x.get("note"), 80)}
                           for x in d["expenses"] if isinstance(x, dict) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(x.get("date", ""))) and _num(x.get("amount"), 0, 500000) > 0]
    if "profile" in d:
        if not isinstance(d["profile"], dict):
            raise AuthError("bad_data")
        pr = {k: _num(d["profile"].get(k), 0, 1e6) for k in PROFILE_KEYS if k in d["profile"]}
        pr["vehicle"] = d["profile"].get("vehicle") if d["profile"].get("vehicle") in VEHICLES else "petrol"
        out["profile"] = pr
    if "hashes" in d:
        if not isinstance(d["hashes"], list) or len(d["hashes"]) > 5000:
            raise AuthError("bad_data")
        out["hashes"] = [h for h in d["hashes"] if isinstance(h, str) and re.fullmatch(r"[0-9a-f]{64}", h)]
    if "lang" in d:
        out["lang"] = d["lang"] if d["lang"] in LANGS else "en"
    if "city" in d:
        out["city"] = d["city"] if d["city"] in CITIES else "Hyderabad"
    if "goal" in d:
        out["goal"] = _num(d["goal"], 100, 100000, 800)
    for f in FLAGS:
        if f in d:
            out[f] = bool(d[f])
    if "reader" in d:
        out["reader"] = _str(d["reader"], 20) or None
    if "lastBatch" in d and isinstance(d["lastBatch"], list):
        out["lastBatch"] = [_str(x, 60) for x in d["lastBatch"][:50]]
    if "rider" in d and isinstance(d["rider"], dict):
        out["rider"] = {"name": _str(d["rider"].get("name"), 60), "phone4": re.sub(r"\D", "", _str(d["rider"].get("phone4"), 4))[:4]}
    blob = json.dumps(out, separators=(",", ":"))
    if len(blob.encode()) > MAX_DATA_BYTES:
        raise AuthError("too_large", 413)
    return out, blob


def get_data(user_id):
    with _conn() as c:
        row = c.execute("SELECT json, version FROM userdata WHERE user_id=?", (user_id,)).fetchone()
        return (json.loads(row["json"]), row["version"]) if row else ({}, 0)


def _mirror(c, uid, new, old):
    """Rewrite the relational copy of every part of the document that changed. Runs inside the caller's transaction."""
    if "sessions" in new and new.get("sessions") != old.get("sessions"):
        c.execute("DELETE FROM work_sessions WHERE user_id=?", (uid,))
        c.execute("DELETE FROM orders WHERE user_id=?", (uid,))
        for sx in new["sessions"]:
            o = sx["orders"]
            c.execute("INSERT OR REPLACE INTO work_sessions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                      (uid, sx["id"], sx["date"], sx["platform"], sx["zone"], sx["onlineMin"], sx["bonus"], sx["source"], len(o), sum(x["pay"] for x in o),
                       sum(x["incentive"] for x in o), sum(x["deduction"] for x in o), sum(x["km"] for x in o)))
            c.executemany("INSERT OR REPLACE INTO orders VALUES(?,?,?,?,?,?,?,?,?,?)",
                          [(uid, sx["id"], i, x["hour"], x["zone"], x["km"], x["pay"], x["incentive"], x["deduction"], x["durMin"]) for i, x in enumerate(o)])
    if "shifts" in new and new.get("shifts") != old.get("shifts"):
        c.execute("DELETE FROM shifts WHERE user_id=?", (uid,))
        c.executemany("INSERT OR REPLACE INTO shifts VALUES(?,?,?,?,?,?,?,?,?,?,?)",
                      [(uid, x["id"], x["date"], x["platform"], x["startTs"], x["endTs"], x["onlineMin"], x["km"], x["gps"], x.get("zone"), json.dumps(x.get("zoneMin") or {})) for x in new["shifts"]])
    if "expenses" in new and new.get("expenses") != old.get("expenses"):
        c.execute("DELETE FROM expenses WHERE user_id=?", (uid,))
        c.executemany("INSERT OR REPLACE INTO expenses VALUES(?,?,?,?,?,?,?,?)",
                      [(uid, x["id"] or "e%d" % i, x["date"], x["category"], x["amount"], x["litres"], x["odo"], x["note"]) for i, x in enumerate(new["expenses"])])


def put_data(user_id, data, base_version):
    cleaned, blob = clean_userdata(data)
    with _conn() as c:
        c.execute("BEGIN IMMEDIATE")
        row = c.execute("SELECT version, json FROM userdata WHERE user_id=?", (user_id,)).fetchone()
        cur = row["version"] if row else 0
        if base_version != cur:
            raise AuthError("conflict", 409)
        try:
            old = json.loads(row["json"]) if row else {}
        except ValueError:
            old = {}
        c.execute("INSERT INTO userdata(user_id,json,version,updated) VALUES(?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET json=excluded.json, version=excluded.version, updated=excluded.updated",
                  (user_id, blob, cur + 1, int(time.time())))
        _mirror(c, user_id, cleaned, old)
        return cur + 1


# ---------------- history, export, usage ----------------
def log_event(user_id, kind, detail=None):
    with _conn() as c:
        c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (user_id, int(time.time()), kind, None if detail is None else str(detail)[:120]))


def log_import(user_id, reader, images, cached, sent, sessions, orders, models):
    with _conn() as c:
        c.execute("INSERT INTO imports(user_id,ts,reader,images,cached,sent,sessions,orders,models) VALUES(?,?,?,?,?,?,?,?,?)",
                  (user_id, int(time.time()), reader, images, cached, sent, sessions, orders, ",".join(models or [])))


def log_statement(user_id, sid, period_from, period_to, monthly):
    with _conn() as c:
        c.execute("INSERT OR REPLACE INTO statements VALUES(?,?,?,?,?,?)", (user_id, str(sid)[:30], int(time.time()), str(period_from or "")[:10], str(period_to or "")[:10], _num(monthly, 0, 1e7)))


def history(user_id, limit=50):
    with _conn() as c:
        def rows(sql, *a):
            return [dict(r) for r in c.execute(sql, a).fetchall()]
        st = c.execute("SELECT COUNT(*) AS days, COALESCE(SUM(n_orders),0) AS orders, COALESCE(SUM(pay+incentive+bonus-deduction),0) AS gross, COALESCE(SUM(km),0) AS km, "
                       "MIN(date) AS first, MAX(date) AS last FROM work_sessions WHERE user_id=?", (user_id,)).fetchone()
        return {"stats": dict(st),
                "imports": rows("SELECT ts, reader, images, cached, sent, sessions, orders, models FROM imports WHERE user_id=? ORDER BY id DESC LIMIT ?", user_id, limit),
                "statements": rows("SELECT sid, ts, period_from, period_to, monthly_take_home FROM statements WHERE user_id=? ORDER BY ts DESC LIMIT ?", user_id, limit),
                "events": rows("SELECT ts, kind, detail FROM events WHERE user_id=? ORDER BY id DESC LIMIT ?", user_id, limit),
                "topZones": rows("SELECT zone, COUNT(*) AS orders, ROUND(SUM(pay+incentive-deduction),0) AS gross FROM orders WHERE user_id=? AND zone<>'Unknown' GROUP BY zone ORDER BY gross DESC LIMIT 8", user_id)}


def _safe_cell(v):
    """Spreadsheet formula injection guard: text starting with = + - @ is prefixed so Excel/Sheets treat it as text."""
    if isinstance(v, str) and v[:1] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + v
    return v


def export_csv(user_id):
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["record", "date", "platform", "hour", "zone", "km", "pay", "incentive", "deduction", "online_min", "category", "amount", "note"])
    with _conn() as c:
        for r in c.execute("SELECT o.*, s.date AS d, s.platform AS p FROM orders o JOIN work_sessions s ON s.user_id=o.user_id AND s.sid=o.sid WHERE o.user_id=? ORDER BY s.date, o.hour", (user_id,)):
            w.writerow(["order", r["d"], _safe_cell(r["p"]), r["hour"], _safe_cell(r["zone"]), r["km"], r["pay"], r["incentive"], r["deduction"], "", "", "", ""])
        for r in c.execute("SELECT * FROM work_sessions WHERE user_id=? ORDER BY date", (user_id,)):
            w.writerow(["day", r["date"], _safe_cell(r["platform"]), "", "", r["km"], "", "", "", r["online_min"], "", "", "bonus %s" % r["bonus"]])
        for r in c.execute("SELECT * FROM shifts WHERE user_id=? ORDER BY date", (user_id,)):
            w.writerow(["shift", r["date"], _safe_cell(r["platform"]), "", _safe_cell(r["zone"] or ""), r["km"], "", "", "", r["online_min"], "", "", ""])
        for r in c.execute("SELECT * FROM expenses WHERE user_id=? ORDER BY date", (user_id,)):
            w.writerow(["expense", r["date"], "", "", "", "", "", "", "", "", r["category"], r["amount"], _safe_cell(r["note"])])
    return out.getvalue()


def ai_usage(user_id):
    day = time.strftime("%Y-%m-%d")
    with _conn() as c:
        r = c.execute("SELECT images, asks FROM ai_usage WHERE user_id=? AND day=?", (user_id, day)).fetchone()
    return {"imagesToday": r["images"] if r else 0, "asksToday": r["asks"] if r else 0, "imageLimit": AI_USER_DAILY}


def ai_spend(user_id, images=0, asks=0):
    """Count AI use against the rider's daily quota. Raises AuthError('ai_user_quota') instead of spending when over it."""
    day = time.strftime("%Y-%m-%d")
    with _conn() as c:
        c.execute("BEGIN IMMEDIATE")
        r = c.execute("SELECT images, asks FROM ai_usage WHERE user_id=? AND day=?", (user_id, day)).fetchone()
        if (r["images"] if r else 0) + images > AI_USER_DAILY or (r["asks"] if r else 0) + asks > AI_USER_ASKS:
            raise AuthError("ai_user_quota", 429)
        c.execute("INSERT INTO ai_usage(user_id,day,images,asks) VALUES(?,?,?,?) ON CONFLICT(user_id,day) DO UPDATE SET images=images+?, asks=asks+?",
                  (user_id, day, images, asks, images, asks))


def rider_id(user_id):
    """Stable anonymous contributor id for the city analytics: HMAC of the account id, not reversible without the server secret."""
    return hmac.new(_SECRET, ("rid:%d" % user_id).encode(), hashlib.sha256).hexdigest()[:24]
