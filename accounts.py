"""TrueWage accounts: per-rider login and private dashboards. Python standard library only (sqlite3, hashlib.scrypt).

Security model
  * Passwords: scrypt (N=2^14, r=8, p=1) with a random 16-byte salt per user; compared in constant time; never logged.
  * Sessions: 32-byte random token in an HttpOnly, SameSite=Strict cookie; only its SHA-256 is stored server-side; 30-day expiry.
  * Login throttling: 5 failures per phone+IP per 15 minutes, 30 per IP; unknown phones cost the same hashing time as known ones.
  * Each rider's data lives in their own row and is only ever read through their own session (no user id is accepted from the client).
  * No SMS or e-mail is sent: sign-in is phone number + password. A forgotten password is recovered with a one-time RECOVERY CODE the rider
    is shown at sign-up (100 random bits, stored only as a scrypt hash, replaced by a new code each time it is used).
  * Review statistics: after a rider checks what the reader found, only COUNTS of what they had to correct are stored (no values), which is
    how the real accuracy of the AI reader and of on-device OCR is measured.

Data model
  * userdata   one versioned JSON document per rider: what the browser syncs (source of truth for the app, optimistic concurrency).
  * work_sessions, orders, shifts, expenses   a relational mirror of that document, rewritten inside the same transaction whenever the
               matching part changes, so the rider's history can be queried, exported and audited with plain SQL.
  * imports    one row per screenshot-reading request (reader, images, cache hits, what was found).
  * statements one row per income statement the rider created.   events   a small activity log (sign-up, login, import, export ...).
  * ai_usage   images read per rider per day (the per-rider AI quota).
"""
import csv, hashlib, hmac, io, json, os, re, secrets, threading, time
import store
from collections import defaultdict, deque

SESSION_DAYS = 30
MAX_DATA_BYTES = 3 * 1024 * 1024
LANGS = {"en", "hi", "te", "ta", "kn", "mr", "bn"}
CITIES = {"Hyderabad", "Bengaluru"}
VEHICLES = {"petrol", "ev", "cng", "car", "cycle"}
OWNERSHIP = {"owned", "rented"}
TRAFFIC = {"light", "normal", "heavy"}
PROFILE_KEYS = {"mileage", "fuelPrice", "maintPerKm", "deadKm", "dataPerHour", "fixedPerDay", "minWage", "fuelPerKmOverride", "serviceEvery",
                "emiPerMonth", "insurancePerYear", "rentPerDay", "detailWear", "tyrePrice", "tyreLife", "oilPrice", "oilEvery", "batteryPrice", "batteryLife"}
FLAGS = {"shared", "vehicleOk", "tourDone", "big", "demo"}
EXPENSE_CATS = {"fuel", "parking_toll", "fine", "repair", "service", "other"}
AI_USER_DAILY = int(os.environ.get("TRUEWAGE_AI_USER_DAILY", "60"))      # images one rider may have read by AI per day
ADMIN_PHONES = {x.strip() for x in os.environ.get("TRUEWAGE_ADMIN_PHONES", "").split(",") if x.strip()}   # riders who may open the admin overview
AI_USER_ASKS = int(os.environ.get("TRUEWAGE_AI_USER_ASKS", "100"))        # Ask questions per rider per day      # images one rider may have read by AI per day

RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"                    # 32 symbols, no 0/O/1/I so it can be read out and typed from paper
RECOVERY_LEN = 20                                                           # 20 x 5 bits = 100 bits
READERS = {"ai", "ocr"}

_lock = threading.Lock()
_fails = defaultdict(deque)
_DUMMY = None


class AuthError(Exception):
    def __init__(self, code, status=400, retry=None):
        super().__init__(code)
        self.code, self.status, self.retry = code, status, retry


def init(data_dir):
    """Open the storage backend (hosted Postgres when DATABASE_URL is set, else a local SQLite file) and make sure the schema exists."""
    global _DUMMY
    store.init(data_dir)
    _DUMMY = hash_password("dummy-password-for-timing")
    secret = store.kv_get("secret")
    if not secret:
        legacy = os.path.join(data_dir, "secret.key")           # keeps anonymous ids stable for installs that predate the database holding the secret
        seed = None
        if os.path.exists(legacy):
            try:
                seed = open(legacy).read().strip()
                bytes.fromhex(seed)
            except (OSError, ValueError):
                seed = None
        secret = store.kv_set_if_absent("secret", seed or secrets.token_hex(32))
    globals()["_SECRET"] = bytes.fromhex(secret)


_conn = store.conn


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


def is_admin(u):
    return bool(u) and u["phone"] in ADMIN_PHONES


def public(u):
    return {"id": u["id"], "name": u["name"], "phone4": u["phone"][-4:], "phoneMasked": "XXXXXX" + u["phone"][-4:], "lang": u["lang"], "admin": is_admin(u), "recovery": bool(u.get("recovery"))}


# ---------------- recovery code ----------------
def new_recovery_code():
    raw = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(RECOVERY_LEN))
    return "-".join(raw[i:i + 5] for i in range(0, RECOVERY_LEN, 5))


def norm_recovery(code):
    """Accept the code as typed: any case, with or without dashes and spaces. Anything that is not a valid code becomes ''."""
    raw = re.sub(r"[\s\-]", "", str(code or "")).upper()
    return raw if len(raw) == RECOVERY_LEN and all(ch in RECOVERY_ALPHABET for ch in raw) else ""


def _recovery_hash(code):
    return hash_password(norm_recovery(code))


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
    code = new_recovery_code()
    with _conn() as c:
        try:
            uid = c.execute("INSERT INTO users(phone,name,pw,lang,created,recovery) VALUES(?,?,?,?,?,?) RETURNING id", (phone, name, pw, lang, int(time.time()), _recovery_hash(code))).fetchone()["id"]
        except store.integrity_errors():
            raise AuthError("phone_exists", 409)
        c.execute("INSERT INTO userdata(user_id,json,version,updated) VALUES(?,?,0,?)", (uid, "{}", int(time.time())))
        token = _new_session(c, uid)
        c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (uid, int(time.time()), "register", None))
        return dict(c.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()), token, code


def _throttled(key_phone, ip, scope="p"):
    """Seconds the caller must wait, or 0. Login ("p") and recovery ("r") keep separate counters: 5 misses per phone+IP and 30 per IP in 15 minutes."""
    now = time.time()
    pk, ik = (scope, key_phone, ip), (scope + "i", ip)
    with _lock:
        for k in (pk, ik):
            q = _fails[k]
            while q and now - q[0] > 900:
                q.popleft()
        if len(_fails[pk]) >= 5:
            return int(900 - (now - _fails[pk][0])) + 1
        if len(_fails[ik]) >= 30:
            return int(900 - (now - _fails[ik][0])) + 1
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
                _fails[("pi", ip)].append(time.time())
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


def recover(phone, code, new_password, ip):
    """Forgot-password flow: the one-time recovery code proves the rider owns the account. On success the password is replaced, every session is
    closed, the used code is retired and a fresh one is issued (returned so the app can show it once). Failures cost the same time either way."""
    try:
        phone = norm_phone(phone)
    except AuthError:
        raise AuthError("bad_recovery", 401)
    check_password(new_password)
    wait = _throttled(phone, ip, "r")
    if wait:
        raise AuthError("locked", 429, wait)
    norm = norm_recovery(code)
    with _conn() as c:
        row = c.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        has = bool(row and row["recovery"])
        ok = verify_password(norm or "invalid", row["recovery"] if has else _DUMMY) and bool(norm) and has
        if not ok:
            with _lock:
                _fails[("r", phone, ip)].append(time.time())
                _fails[("ri", ip)].append(time.time())
            raise AuthError("bad_recovery", 401)
        with _lock:
            _fails.pop(("r", phone, ip), None)
        fresh = new_recovery_code()
        c.execute("UPDATE users SET pw=?, recovery=? WHERE id=?", (hash_password(new_password), _recovery_hash(fresh), row["id"]))
        c.execute("DELETE FROM sessions WHERE user_id=?", (row["id"],))
        c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (row["id"], int(time.time()), "recovered", None))
        token = _new_session(c, row["id"])
        return dict(c.execute("SELECT * FROM users WHERE id=?", (row["id"],)).fetchone()), token, fresh


def regenerate_recovery(user_id, password):
    """Issue a new recovery code (the old one stops working). Needs the current password. Also how riders who signed up before v2 get their first code."""
    with _conn() as c:
        row = c.execute("SELECT pw FROM users WHERE id=?", (user_id,)).fetchone()
        if not row or not isinstance(password, str) or not verify_password(password, row["pw"]):
            raise AuthError("bad_credentials", 401)
        code = new_recovery_code()
        c.execute("UPDATE users SET recovery=? WHERE id=?", (_recovery_hash(code), user_id))
        c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (user_id, int(time.time()), "recovery_code", None))
        return code


def logout_others(user_id, keep_token):
    """Close every session of this rider except the one making the request (a lost or shared phone)."""
    with _conn() as c:
        c.execute("DELETE FROM sessions WHERE user_id=? AND token_hash<>?", (user_id, hashlib.sha256((keep_token or "").encode()).hexdigest()))
        c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (user_id, int(time.time()), "logout_others", None))


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
                         "onlineMin": _num(s.get("onlineMin"), 0, 1440), "bonus": _num(s.get("bonus"), 0, 20000), "source": _str(s.get("source"), 20), "orders": orders,
                         "rev": _num(s.get("rev"), 0, 4e12), "edited": bool(s.get("edited"))})
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
    if isinstance(d.get("analytics"), dict) and d["analytics"].get("days"):
        a = d["analytics"]
        out["analytics"] = {"from": _str(a.get("from"), 10), "to": _str(a.get("to"), 10), "days": int(_num(a.get("days"), 0, 100000)), "orders": int(_num(a.get("orders"), 0, 10000000)),
                            **{k: _num(a.get(k), -1e9, 1e9) for k in ("hours", "appShown", "gross", "cost", "net", "perHr", "appPerHr", "lo", "hi")},
                            "byDay": [{"date": _str(x.get("date"), 10), "orders": int(_num(x.get("orders"), 0, 100000)), **{k: _num(x.get(k), -1e9, 1e9) for k in ("hours", "appShown", "gross", "net", "perHr")}}
                                      for x in (a.get("byDay") or [])[:1500] if isinstance(x, dict) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(x.get("date", "")))],
                            "slots": [{"zone": _str(x.get("zone"), 40, "Unknown"), "daypart": _str(x.get("daypart"), 12), "orders": int(_num(x.get("orders"), 0, 100000)), "hours": _num(x.get("hours"), 0, 100000), "perHr": _num(x.get("perHr"), -1e6, 1e6)}
                                      for x in (a.get("slots") or [])[:600] if isinstance(x, dict) and x.get("daypart") in ("morning", "lunch", "afternoon", "evening", "night")]}
    if "profile" in d:
        if not isinstance(d["profile"], dict):
            raise AuthError("bad_data")
        pr = {k: _num(d["profile"].get(k), 0, 1e6) for k in PROFILE_KEYS if k in d["profile"]}
        pr["vehicle"] = d["profile"].get("vehicle") if d["profile"].get("vehicle") in VEHICLES else "petrol"
        pr["ownership"] = d["profile"].get("ownership") if d["profile"].get("ownership") in OWNERSHIP else "owned"
        pr["traffic"] = d["profile"].get("traffic") if d["profile"].get("traffic") in TRAFFIC else "normal"
        out["profile"] = pr
    if "gone" in d:                                       # ids of records the rider deleted, so another device cannot bring them back
        if not isinstance(d["gone"], list) or len(d["gone"]) > 3000:
            raise AuthError("bad_data")
        out["gone"] = [{"id": _str(x.get("id"), 60), "ts": _num(x.get("ts"), 0, 4e12)} for x in d["gone"] if isinstance(x, dict) and x.get("id")]
    if "payouts" in d:                                    # what a platform paid for a period, typed in by the rider, to check against their own order records
        if not isinstance(d["payouts"], list) or len(d["payouts"]) > 600:
            raise AuthError("bad_data")
        ok = lambda v: re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v or "")) is not None          # noqa: E731
        out["payouts"] = [{"id": _str(x.get("id"), 40), "platform": _str(x.get("platform"), 30, "All"), "from": x["from"], "to": x["to"], "amount": _num(x.get("amount"), 0, 10000000), "note": _str(x.get("note"), 80)}
                          for x in d["payouts"] if isinstance(x, dict) and ok(x.get("from")) and ok(x.get("to")) and x["from"] <= x["to"]]
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


UP_WS = store.upsert_sql("work_sessions", ["user_id", "sid", "date", "platform", "zone", "online_min", "bonus", "source", "n_orders", "pay", "incentive", "deduction", "km"], ["user_id", "sid"])
UP_ORD = store.upsert_sql("orders", ["user_id", "sid", "idx", "hour", "zone", "km", "pay", "incentive", "deduction", "dur_min"], ["user_id", "sid", "idx"])
UP_SHIFT = store.upsert_sql("shifts", ["user_id", "sid", "date", "platform", "start_ts", "end_ts", "online_min", "km", "gps", "zone", "zone_min"], ["user_id", "sid"])
UP_EXP = store.upsert_sql("expenses", ["user_id", "eid", "date", "category", "amount", "litres", "odo", "note"], ["user_id", "eid"])
UP_STMT = store.upsert_sql("statements", ["user_id", "sid", "ts", "period_from", "period_to", "monthly_take_home"], ["user_id", "sid"])


UP_AS = store.upsert_sql("analytics_summary", ["user_id", "updated", "from_date", "to_date", "days", "orders", "hours", "app_shown", "gross", "cost", "net", "per_hr", "app_per_hr", "lo_per_hr", "hi_per_hr"], ["user_id"])
UP_AD = store.upsert_sql("analytics_days", ["user_id", "date", "orders", "hours", "app_shown", "gross", "cost", "net", "per_hr"], ["user_id", "date"])
UP_ASL = store.upsert_sql("analytics_slots", ["user_id", "zone", "daypart", "orders", "hours", "per_hr"], ["user_id", "zone", "daypart"])


def _mirror(c, uid, new, old):
    """Rewrite the relational copy of every part of the document that changed. Runs inside the caller's transaction."""
    if "sessions" in new and new.get("sessions") != old.get("sessions"):
        c.execute("DELETE FROM work_sessions WHERE user_id=?", (uid,))
        c.execute("DELETE FROM orders WHERE user_id=?", (uid,))
        for sx in new["sessions"]:
            o = sx["orders"]
            c.execute(UP_WS, (uid, sx["id"], sx["date"], sx["platform"], sx["zone"], sx["onlineMin"], sx["bonus"], sx["source"], len(o), sum(x["pay"] for x in o),
                              sum(x["incentive"] for x in o), sum(x["deduction"] for x in o), sum(x["km"] for x in o)))
            c.executemany(UP_ORD, [(uid, sx["id"], i, x["hour"], x["zone"], x["km"], x["pay"], x["incentive"], x["deduction"], x["durMin"]) for i, x in enumerate(o)])
    if "shifts" in new and new.get("shifts") != old.get("shifts"):
        c.execute("DELETE FROM shifts WHERE user_id=?", (uid,))
        c.executemany(UP_SHIFT, [(uid, x["id"], x["date"], x["platform"], x["startTs"], x["endTs"], x["onlineMin"], x["km"], x["gps"], x.get("zone"), json.dumps(x.get("zoneMin") or {})) for x in new["shifts"]])
    if new.get("analytics") and new.get("analytics") != old.get("analytics"):
        a = new["analytics"]
        c.execute(UP_AS, (uid, int(time.time()), a["from"], a["to"], a["days"], a["orders"], a["hours"], a["appShown"], a["gross"], a["cost"], a["net"], a["perHr"], a["appPerHr"], a["lo"], a["hi"]))
        c.execute("DELETE FROM analytics_days WHERE user_id=?", (uid,))
        c.executemany(UP_AD, [(uid, x["date"], x["orders"], x["hours"], x["appShown"], x["gross"], x["gross"] - x["net"], x["net"], x["perHr"]) for x in a["byDay"]])
        c.execute("DELETE FROM analytics_slots WHERE user_id=?", (uid,))
        merged = {}
        for x in a["slots"]:                                         # one row per area and time of day
            k = (x["zone"], x["daypart"])
            m = merged.setdefault(k, [0, 0.0, 0.0])
            m[0] += x["orders"]; m[1] += x["hours"]; m[2] += x["perHr"] * x["hours"]
        c.executemany(UP_ASL, [(uid, z, d, m[0], m[1], (m[2] / m[1]) if m[1] else 0.0) for (z, d), m in merged.items()])
    if "expenses" in new and new.get("expenses") != old.get("expenses"):
        c.execute("DELETE FROM expenses WHERE user_id=?", (uid,))
        c.executemany(UP_EXP, [(uid, x["id"] or "e%d" % i, x["date"], x["category"], x["amount"], x["litres"], x["odo"], x["note"]) for i, x in enumerate(new["expenses"])])


def _change_note(old, new):
    """Short human note about what a save added or removed, e.g. '+2 days, +17 orders, +1 expense'. None when nothing record-like changed."""
    def ids(d, k):
        return {x.get("id") for x in (d.get(k) or [])}
    parts = []
    if "sessions" in new:
        added = ids(new, "sessions") - ids(old, "sessions")
        gone = ids(old, "sessions") - ids(new, "sessions")
        before = {x.get("id"): x for x in (old.get("sessions") or [])}
        changed = [x for x in new["sessions"] if x["id"] in before and (before[x["id"]].get("orders") != x["orders"] or before[x["id"]].get("date") != x["date"] or before[x["id"]].get("platform") != x["platform"])]
        if changed:
            parts.append("%d day%s edited" % (len(changed), "" if len(changed) == 1 else "s"))
        n_orders = sum(len(x["orders"]) for x in new["sessions"] if x["id"] in added)
        if added:
            parts.append("+%d day%s, +%d orders" % (len(added), "" if len(added) == 1 else "s", n_orders))
        if gone:
            parts.append("-%d day%s" % (len(gone), "" if len(gone) == 1 else "s"))
    if "expenses" in new:
        a, g = len(ids(new, "expenses") - ids(old, "expenses")), len(ids(old, "expenses") - ids(new, "expenses"))
        if a:
            parts.append("+%d expense%s" % (a, "" if a == 1 else "s"))
        if g:
            parts.append("-%d expense%s" % (g, "" if g == 1 else "s"))
    if "shifts" in new:
        a = len(ids(new, "shifts") - ids(old, "shifts"))
        if a:
            parts.append("+%d shift%s" % (a, "" if a == 1 else "s"))
    return ", ".join(parts) or None


def put_data(user_id, data, base_version):
    cleaned, blob = clean_userdata(data)
    with _conn() as c:
        c.begin_write()
        row = c.execute("SELECT version, json FROM userdata WHERE user_id=?" + c.for_update, (user_id,)).fetchone()
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
        note = _change_note(old, cleaned)
        if note:
            c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (user_id, int(time.time()), "saved", note))
        return cur + 1


# ---------------- history, export, usage ----------------
def log_event(user_id, kind, detail=None):
    with _conn() as c:
        c.execute("INSERT INTO events(user_id,ts,kind,detail) VALUES(?,?,?,?)", (user_id, int(time.time()), kind, None if detail is None else str(detail)[:120]))


def log_import(user_id, reader, images, cached, sent, sessions, orders, models):
    with _conn() as c:
        c.execute("INSERT INTO imports(user_id,ts,reader,images,cached,sent,sessions,orders,models) VALUES(?,?,?,?,?,?,?,?,?)",
                  (user_id, int(time.time()), reader, images, cached, sent, sessions, orders, ",".join(models or [])))


def log_review(user_id, reader, orders_read, orders_untouched, orders_removed, orders_added, fields_read, fields_changed):
    """Store the COUNTS of what a rider corrected while checking a reading. No amounts, places or screenshots are kept."""
    if reader not in READERS:
        raise AuthError("bad_data")
    n = lambda v, hi=100000: int(_num(v, 0, hi))                      # noqa: E731
    r, u, rm, ad, fr, fc = n(orders_read), n(orders_untouched), n(orders_removed), n(orders_added), n(fields_read, 1000000), n(fields_changed, 1000000)
    if u + rm > r or fc > fr or (r == 0 and fr):
        raise AuthError("bad_data")                                     # impossible counts: refuse instead of skewing the accuracy figure
    with _conn() as c:
        c.execute("INSERT INTO review_stats(user_id,ts,reader,orders_read,orders_untouched,orders_removed,orders_added,fields_read,fields_changed) VALUES(?,?,?,?,?,?,?,?,?)",
                  (user_id, int(time.time()), reader, r, u, rm, ad, fr, fc))


MIN_FIELDS_FOR_ACCURACY = 100


def accuracy():
    """Measured reading accuracy per reader, from what riders had to correct. 'ready' only once enough fields were checked to mean something."""
    out = {}
    with _conn() as c:
        for r in c.execute("SELECT reader, COUNT(*) AS reviews, COALESCE(SUM(orders_read),0) AS orders, COALESCE(SUM(orders_untouched),0) AS untouched, "
                           "COALESCE(SUM(orders_removed),0) AS removed, COALESCE(SUM(orders_added),0) AS added, COALESCE(SUM(fields_read),0) AS fields, "
                           "COALESCE(SUM(fields_changed),0) AS changed, COUNT(DISTINCT user_id) AS riders FROM review_stats GROUP BY reader").fetchall():
            f, o = int(r["fields"]), int(r["orders"])
            out[r["reader"]] = {"reviews": int(r["reviews"]), "riders": int(r["riders"]), "orders": o, "ordersUntouched": int(r["untouched"]), "ordersRemoved": int(r["removed"]),
                                "ordersAdded": int(r["added"]), "fields": f, "fieldsChanged": int(r["changed"]), "ready": f >= MIN_FIELDS_FOR_ACCURACY,
                                "fieldAccuracy": round(1 - int(r["changed"]) / f, 4) if f else None, "orderAccuracy": round(int(r["untouched"]) / o, 4) if o else None}
    return out


def log_statement(user_id, sid, period_from, period_to, monthly):
    with _conn() as c:
        c.execute(UP_STMT, (user_id, str(sid)[:30], int(time.time()), str(period_from or "")[:10], str(period_to or "")[:10], _num(monthly, 0, 1e7)))


def history(user_id, limit=50):
    with _conn() as c:
        def rows(sql, *a):
            return [dict(r) for r in c.execute(sql, a).fetchall()]
        st = c.execute("SELECT COUNT(*) AS days, CAST(COALESCE(SUM(n_orders),0) AS BIGINT) AS orders, COALESCE(SUM(pay+incentive+bonus-deduction),0) AS gross, COALESCE(SUM(km),0) AS km, "
                       "MIN(date) AS first, MAX(date) AS last FROM work_sessions WHERE user_id=?", (user_id,)).fetchone()
        summ = c.execute("SELECT updated, from_date, to_date, days, orders, hours, app_shown, gross, cost, net, per_hr, app_per_hr, lo_per_hr, hi_per_hr FROM analytics_summary WHERE user_id=?", (user_id,)).fetchone()
        slots = [dict(r) for r in c.execute("SELECT zone, daypart, orders, hours, per_hr FROM analytics_slots WHERE user_id=? AND hours>=1.5 AND zone<>'Unknown' ORDER BY per_hr DESC LIMIT 5", (user_id,)).fetchall()]
        return {"stats": dict(st), "analytics": dict(summ) if summ else None, "bestSlots": slots,
                "imports": rows("SELECT ts, reader, images, cached, sent, sessions, orders, models FROM imports WHERE user_id=? ORDER BY id DESC LIMIT ?", user_id, limit),
                "statements": rows("SELECT sid, ts, period_from, period_to, monthly_take_home FROM statements WHERE user_id=? ORDER BY ts DESC LIMIT ?", user_id, limit),
                "events": rows("SELECT ts, kind, detail FROM events WHERE user_id=? ORDER BY id DESC LIMIT ?", user_id, limit),
                "topZones": [dict(z, gross=round(z["gross"] or 0)) for z in rows("SELECT zone, COUNT(*) AS orders, SUM(pay+incentive-deduction) AS gross FROM orders WHERE user_id=? AND zone<>'Unknown' GROUP BY zone ORDER BY SUM(pay+incentive-deduction) DESC LIMIT 8", user_id)]}


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
        c.begin_write()
        c.execute("INSERT INTO ai_usage(user_id,day,images,asks) VALUES(?,?,0,0) ON CONFLICT(user_id,day) DO NOTHING", (user_id, day))
        r = c.execute("SELECT images, asks FROM ai_usage WHERE user_id=? AND day=?" + c.for_update, (user_id, day)).fetchone()
        if r["images"] + images > AI_USER_DAILY or r["asks"] + asks > AI_USER_ASKS:
            raise AuthError("ai_user_quota", 429)
        c.execute("UPDATE ai_usage SET images=images+?, asks=asks+? WHERE user_id=? AND day=?", (images, asks, user_id, day))


def rider_id(user_id):
    """Stable anonymous contributor id for the city analytics: HMAC of the account id, not reversible without the server secret."""
    return hmac.new(_SECRET, ("rid:%d" % user_id).encode(), hashlib.sha256).hexdigest()[:24]


def admin_overview():
    """Totals and one row per rider (phone masked). Only reachable by riders listed in TRUEWAGE_ADMIN_PHONES."""
    with _conn() as c:
        def one(sql):
            return c.execute(sql).fetchone()
        tot = {"riders": one("SELECT COUNT(*) AS n FROM users")["n"], "days": one("SELECT COUNT(*) AS n FROM work_sessions")["n"],
               "orders": one("SELECT COUNT(*) AS n FROM orders")["n"], "expenses": one("SELECT COUNT(*) AS n FROM expenses")["n"],
               "imports": one("SELECT COUNT(*) AS n FROM imports")["n"], "statements": one("SELECT COUNT(*) AS n FROM statements")["n"],
               "contributions": one("SELECT COUNT(*) AS n FROM contributions")["n"], "aiCached": one("SELECT COUNT(*) AS n FROM extract_cache")["n"]}
        day = time.strftime("%Y-%m-%d")
        b = c.execute("SELECT images FROM ai_budget WHERE day=?", (day,)).fetchone()
        tot["aiImagesToday"] = b["images"] if b else 0
        rows = [dict(r) for r in c.execute(
            "SELECT u.id, u.name, u.phone, u.lang, u.created, "
            "(SELECT COUNT(*) FROM work_sessions w WHERE w.user_id=u.id) AS days, (SELECT COUNT(*) FROM orders o WHERE o.user_id=u.id) AS orders, "
            "(SELECT COUNT(*) FROM expenses e WHERE e.user_id=u.id) AS expenses, (SELECT COUNT(*) FROM imports i WHERE i.user_id=u.id) AS imports, "
            "(SELECT MAX(ts) FROM events v WHERE v.user_id=u.id) AS last_active FROM users u ORDER BY u.id DESC LIMIT 200").fetchall()]
    for r in rows:
        r["phone"] = "XXXXXX" + r["phone"][-4:]
    return {"totals": tot, "riders": rows, "accuracy": accuracy()}
