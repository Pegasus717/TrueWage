"""TrueWage observability: request metrics, an error log, and a readiness check. Python standard library only.

  * Metrics are kept in memory (they restart with the process): request counts by route group and status class, latency percentiles over the
    last 500 requests of each route group, and the AI reader's calls and failures. GET /api/metrics serves them in the Prometheus text format.
  * Errors are written to the error_log table so they survive restarts: server exceptions and browser errors reported by the app itself.
    Nothing is stored except a short, scrubbed message, the route group and a request id. No request bodies, phone numbers, IP addresses
    or rider ids.
  * One JSON line per API request goes to standard output (hosts such as Render keep it): time, request id, method, route group, status, ms.
"""
import json, re, sys, threading, time, uuid
from collections import defaultdict, deque

import store

VERSION = "3.0.0"
STARTED = time.time()
KEEP_ERRORS = 500
_lock = threading.Lock()
_count = defaultdict(int)                                   # (group, status class) -> n
_lat = defaultdict(lambda: deque(maxlen=500))               # group -> recent milliseconds
_ai = defaultdict(int)                                      # calls, failures, escalations ...
_inserts = 0
LOG_REQUESTS = False                                         # switched on by server.py when it runs as the real server (TRUEWAGE_LOG=0 turns it off)


KNOWN_API = {"/api/health", "/api/health/ready", "/api/metrics", "/api/me", "/api/me/data", "/api/me/password", "/api/me/recovery", "/api/me/logout-others", "/api/me/review",
             "/api/me/history", "/api/me/export.csv", "/api/auth/register", "/api/auth/login", "/api/auth/logout", "/api/auth/recover", "/api/extract", "/api/ask",
             "/api/statement", "/api/contribute", "/api/city", "/api/accuracy", "/api/client-error", "/api/admin/overview", "/api/admin/backup"}


def route_group(method, path):
    """A small fixed set of names, so a scanner hitting random URLs cannot create unlimited metric series."""
    if path.startswith("/api/statement/"):
        return "GET /api/statement/:id"
    if path.startswith("/api/"):
        return "%s %s" % (method, path if path in KNOWN_API else "/api/other")
    return "static"


def request_id():
    return uuid.uuid4().hex[:12]


def record(method, path, status, ms, rid=None):
    g = route_group(method, path)
    with _lock:
        _count[(g, "%dxx" % (status // 100))] += 1
        _lat[g].append(ms)
    if LOG_REQUESTS and g != "static" and path != "/api/health":
        try:
            sys.stdout.write(json.dumps({"t": int(time.time()), "id": rid, "m": method, "r": g.split(" ", 1)[-1], "s": status, "ms": round(ms, 1)}, separators=(",", ":")) + "\n")
            sys.stdout.flush()
        except Exception:
            pass


def ai_event(name):
    with _lock:
        _ai[name] += 1


def _pct(vals, q):
    if not vals:
        return None
    s = sorted(vals)
    return round(s[min(len(s) - 1, int(len(s) * q))], 1)


def snapshot():
    with _lock:
        counts = dict(_count)
        lat = {g: list(v) for g, v in _lat.items()}
        ai = dict(_ai)
    groups = {}
    for (g, cls), n in counts.items():
        e = groups.setdefault(g, {"n": 0, "errors": 0, "clientErrors": 0})
        e["n"] += n
        if cls == "5xx":
            e["errors"] += n
        if cls == "4xx":
            e["clientErrors"] += n
    for g, e in groups.items():
        e["p50"], e["p95"] = _pct(lat.get(g, []), 0.5), _pct(lat.get(g, []), 0.95)
    total = sum(e["n"] for e in groups.values())
    return {"version": VERSION, "uptimeS": int(time.time() - STARTED), "requests": total, "errors5xx": sum(e["errors"] for e in groups.values()), "routes": groups, "ai": ai}


def prometheus(extra=None):
    s = snapshot()
    out = ["# TYPE truewage_up gauge", "truewage_up 1", "# TYPE truewage_uptime_seconds gauge", "truewage_uptime_seconds %d" % s["uptimeS"],
           "# TYPE truewage_requests_total counter"]
    for g, e in sorted(s["routes"].items()):
        lab = g.replace('"', "'")
        out.append('truewage_requests_total{route="%s"} %d' % (lab, e["n"]))
    out.append("# TYPE truewage_errors_total counter")
    for g, e in sorted(s["routes"].items()):
        out.append('truewage_errors_total{route="%s"} %d' % (g.replace('"', "'"), e["errors"]))
    out.append("# TYPE truewage_latency_p95_ms gauge")
    for g, e in sorted(s["routes"].items()):
        if e["p95"] is not None:
            out.append('truewage_latency_p95_ms{route="%s"} %s' % (g.replace('"', "'"), e["p95"]))
    out.append("# TYPE truewage_ai_events_total counter")
    for k, n in sorted(s["ai"].items()):
        out.append('truewage_ai_events_total{event="%s"} %d' % (re.sub(r"[^a-z_]", "", k), n))
    for k, v in (extra or {}).items():
        out.append("# TYPE truewage_%s gauge" % k)
        out.append("truewage_%s %s" % (k, v))
    return "\n".join(out) + "\n"


# ---------------- error log ----------------
_SCRUB_NUM = re.compile(r"\d{6,}")
_SCRUB_URL = re.compile(r"https?://\S+")


def scrub(text, n=240):
    """Short, with long digit runs (phone numbers, ids) and URLs removed, so an error message can never carry a rider's details."""
    s = _SCRUB_URL.sub("<url>", str(text or ""))
    s = _SCRUB_NUM.sub("#", s)
    return re.sub(r"[\x00-\x1f]+", " ", s).strip()[:n]


def log_error(kind, route, err, rid=None):
    """kind: 'server' (an exception in this process) or 'client' (reported by the app in a browser). err is an exception or a message."""
    global _inserts
    msg = ("%s: %s" % (type(err).__name__, err) if isinstance(err, BaseException) else str(err))
    try:
        with store.conn() as c:
            c.execute("INSERT INTO error_log(ts,kind,route,message,request_id) VALUES(?,?,?,?,?)", (int(time.time()), kind[:10], scrub(route, 60), scrub(msg), rid))
            _inserts += 1
            if _inserts % 25 == 0:
                c.execute("DELETE FROM error_log WHERE id <= (SELECT MAX(id) FROM error_log) - ?", (KEEP_ERRORS,))
    except Exception:                                      # logging must never take a request down
        sys.stderr.write("error_log write failed\n")
    sys.stderr.write("%s error on %s: %s\n" % (kind, scrub(route, 60), scrub(msg, 120)))


def recent_errors(limit=20):
    with store.conn() as c:
        return [dict(r) for r in c.execute("SELECT ts, kind, route, message, request_id FROM error_log ORDER BY id DESC LIMIT ?", (int(limit),)).fetchall()]


def errors_since(seconds=86400):
    with store.conn() as c:
        r = c.execute("SELECT COUNT(*) AS n FROM error_log WHERE ts >= ?", (int(time.time() - seconds),)).fetchone()
        s = c.execute("SELECT COUNT(*) AS n FROM error_log WHERE ts >= ? AND kind='server'", (int(time.time() - seconds),)).fetchone()
    return {"total": int(r["n"]), "server": int(s["n"])}


def clean_client_error(b):
    """Validate a browser error report. Returns the message to store, or None."""
    if not isinstance(b, dict):
        return None
    msg = scrub(b.get("msg"), 160)
    if not msg:
        return None
    src = re.sub(r"[?#].*$", "", str(b.get("src") or "")).rsplit("/", 1)[-1][-40:]          # just the file name: no host, path or query
    where = "%s:%s" % (scrub(src, 60), int(b["line"])) if isinstance(b.get("line"), int) and 0 <= b["line"] < 10 ** 7 else scrub(src, 60)
    return "%s [%s v%s]" % (msg, where, scrub(b.get("v"), 12))


def ready():
    """Is the database answering? Returns (ok, milliseconds)."""
    t = time.time()
    try:
        with store.conn() as c:
            c.execute("SELECT 1").fetchone()
        return True, round((time.time() - t) * 1000, 1)
    except Exception:
        return False, round((time.time() - t) * 1000, 1)
