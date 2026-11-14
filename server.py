#!/usr/bin/env python3
"""TrueWage server (Python 3.9+, standard library only).

  * Serves the static app (index.html, css/, js/ only: nothing else on disk is reachable).
  * POST /api/extract      reads earnings screenshots with Claude vision (needs ANTHROPIC_API_KEY)
  * POST /api/statement    registers an income-statement hash;  GET /api/statement/<id> verifies it
  * POST /api/contribute   accepts an anonymous, aggregated pay contribution;  GET /api/city returns k-anonymous results
  * GET  /api/health

Configuration (environment variables, or a .env file next to this script that is NOT committed):
  ANTHROPIC_API_KEY   optional. Without it the app falls back to on-device OCR in the browser.
  TRUEWAGE_MODEL      default claude-sonnet-5-5
  PORT / HOST         default 8080 / 0.0.0.0
  TRUEWAGE_DATA       directory for registry.json and contributions.json (default ./data)
  TRUEWAGE_TRUST_PROXY=1  use X-Forwarded-For for rate limiting (only behind your own reverse proxy)

Screenshots are forwarded to the model API and are never written to disk. The API key is read once at start-up and never
sent to the browser or written to logs.
"""
import base64, binascii, json, os, re, sys, threading, time, urllib.error, urllib.request
from collections import defaultdict, deque
from datetime import date
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.abspath(__file__))


def load_dotenv(path):
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except OSError:
        pass


load_dotenv(os.path.join(ROOT, ".env"))
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "").strip()
MODEL = os.environ.get("TRUEWAGE_MODEL", "claude-sonnet-5-5")
API_URL = os.environ.get("ANTHROPIC_API_URL", "https://api.anthropic.com/v1/messages")  # overridable for tests
DATA_DIR = os.environ.get("TRUEWAGE_DATA", os.path.join(ROOT, "data"))
TRUST_PROXY = os.environ.get("TRUEWAGE_TRUST_PROXY") == "1"
K_ANON = 20
MAX_IMAGES = 12
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_BODY = 28 * 1024 * 1024
DAYPARTS = {"morning", "lunch", "afternoon", "evening", "night"}
PLATFORMS = {"Swiggy", "Zomato", "Rapido", "Ola", "Uber", "Porter", "Blinkit", "Zepto", "Dunzo", "Shadowfax", "Ecom Express"}
STATIC_OK = re.compile(r"^/(index\.html|css/[\w.\-]+\.css|js/[\w.\-]+\.js)?$")
MIME = {".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8"}

PROMPT = """You read screenshots of gig-work earnings screens from Indian delivery and ride apps
(Swiggy, Zomato, Rapido, Ola, Uber, Porter, Blinkit, Zepto ...). Text may be in English, Hindi, Telugu, Tamil, Kannada or mixed.
Return ONLY JSON, no prose, in this exact shape:
{"sessions":[{"platform":"Swiggy","date":"YYYY-MM-DD","online_minutes":0,"zone":"area name or null","bonus":0,
"orders":[{"time":"HH:MM","zone":"area or null","km":0.0,"pay":0,"incentive":0,"deduction":0,"duration_min":0}]}]}
Rules: amounts are rupees as numbers. 'pay' = base + distance + tip for that order. 'incentive' = per-order surge/peak extra.
'bonus' (session level) = daily target / joining / weekly bonus not tied to one order. 'deduction' = penalty, fee, fine, cancellation
charge. Use 24-hour time. If a value is not visible use 0 (or null for zone). One session per app per day; merge screenshots that
show the same app and day. Never invent orders that are not visible. If the image is not an earnings screen return {"sessions":[]}."""

_lock = threading.Lock()
_hits = defaultdict(deque)
LIMITS = {"extract": (20, 3600), "statement": (60, 3600), "contribute": (30, 3600)}


def rate_ok(bucket, ip):
    n, window = LIMITS[bucket]
    now = time.time()
    with _lock:
        q = _hits[(bucket, ip)]
        while q and now - q[0] > window:
            q.popleft()
        if len(q) >= n:
            return False
        q.append(now)
        if len(_hits) > 5000:  # bound memory
            for k in list(_hits)[:1000]:
                _hits.pop(k, None)
        return True


def read_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write_json_atomic(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f)
    os.replace(tmp, path)


REGISTRY = os.path.join(DATA_DIR, "registry.json")
CONTRIB = os.path.join(DATA_DIR, "contributions.json")


# ---------------- screenshot extraction ----------------
def sniff(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def clean_images(images):
    if not isinstance(images, list) or not 1 <= len(images) <= MAX_IMAGES:
        raise ValueError("send between 1 and %d images" % MAX_IMAGES)
    out, total = [], 0
    for url in images:
        m = re.fullmatch(r"data:(image/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\s]+)", url if isinstance(url, str) else "")
        if not m:
            raise ValueError("images must be PNG, JPEG or WebP data URLs")
        try:
            raw = base64.b64decode(m.group(2), validate=False)
        except (binascii.Error, ValueError):
            raise ValueError("bad base64 image")
        if len(raw) > MAX_IMAGE_BYTES:
            raise ValueError("image too large (max 8 MB)")
        kind = sniff(raw)
        if kind is None:
            raise ValueError("file content is not a PNG, JPEG or WebP image")
        total += len(raw)
        out.append({"type": "image", "source": {"type": "base64", "media_type": kind, "data": base64.b64encode(raw).decode()}})
    if total > 24 * 1024 * 1024:
        raise ValueError("images too large in total")
    return out


def num(v, lo, hi, default=0.0):
    try:
        x = float(v)
    except (TypeError, ValueError):
        return default
    return default if x != x else max(lo, min(hi, x))


def sanitize_sessions(obj):
    """Never trust model output: coerce to the schema, clamp ranges, drop junk."""
    out = []
    for s in (obj.get("sessions") if isinstance(obj, dict) else None) or []:
        if not isinstance(s, dict):
            continue
        d = str(s.get("date") or "")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
            d = date.today().isoformat()
        orders = []
        for o in (s.get("orders") or [])[:300]:
            if not isinstance(o, dict):
                continue
            m = re.fullmatch(r"(\d{1,2}):(\d{2})", str(o.get("time") or "").strip())
            if not m or int(m.group(1)) > 29 or int(m.group(2)) > 59:
                continue
            orders.append({"time": "%02d:%s" % (int(m.group(1)), m.group(2)), "zone": str(o.get("zone") or s.get("zone") or "Unknown")[:40],
                           "km": num(o.get("km"), 0, 150), "pay": num(o.get("pay"), 0, 5000), "incentive": num(o.get("incentive"), 0, 5000),
                           "deduction": num(o.get("deduction"), 0, 5000), "duration_min": num(o.get("duration_min"), 0, 240)})
        if orders:
            plat = str(s.get("platform") or "Unknown")[:30]
            out.append({"platform": plat if plat in PLATFORMS else "Unknown", "date": d, "online_minutes": num(s.get("online_minutes"), 0, 1440),
                        "zone": str(s.get("zone") or "")[:40] or None, "bonus": num(s.get("bonus"), 0, 20000), "orders": orders})
    return {"sessions": out}


def parse_json(text):
    text = text.strip()
    try:
        return json.loads(text)
    except ValueError:
        m = re.search(r"\{.*\}", text, re.S)
        if not m:
            raise ValueError("no JSON in model output")
        return json.loads(m.group(0))


def call_claude(images):
    content = clean_images(images) + [{"type": "text", "text": PROMPT}]
    body = json.dumps({"model": MODEL, "max_tokens": 4096, "messages": [{"role": "user", "content": content}]}).encode()
    req = urllib.request.Request(API_URL, data=body,
                                 headers={"content-type": "application/json", "x-api-key": API_KEY, "anthropic-version": "2023-06-01"})
    with urllib.request.urlopen(req, timeout=90) as r:
        out = json.loads(r.read())
    text = "".join(b.get("text", "") for b in out.get("content", []) if b.get("type") == "text")
    return sanitize_sessions(parse_json(text))


# ---------------- contributions (k-anonymous aggregate) ----------------
def clean_cells(cells):
    out = []
    for c in (cells if isinstance(cells, list) else [])[:200]:
        if not isinstance(c, dict) or c.get("daypart") not in DAYPARTS:
            continue
        zone = re.sub(r"[^\w .\-]", "", str(c.get("zone") or ""))[:40].strip()
        if not zone:
            continue
        plat = str(c.get("platform") or "")
        out.append({"platform": plat if plat in PLATFORMS else "Other", "zone": zone, "daypart": c["daypart"],
                    "perHr": num(c.get("perHr"), -500, 1000), "hours": num(c.get("hours"), 0, 2000)})
    return out


def city_summary():
    data = read_json(CONTRIB, {})
    cells = defaultdict(list)
    for rid, rec in data.items():
        per = defaultdict(lambda: [0.0, 0.0])  # a rider counts once per zone x daypart, weighted by hours
        for c in rec["cells"]:
            per[(c["zone"], c["daypart"])][0] += c["perHr"] * c["hours"]
            per[(c["zone"], c["daypart"])][1] += c["hours"]
        for k, (w, h) in per.items():
            if h > 0:
                cells[k].append(w / h)
    shown = []
    for (zone, dp), vals in cells.items():
        if len(vals) >= K_ANON:  # k-anonymity: a cell is revealed only with 20+ distinct riders
            vals.sort()
            shown.append({"zone": zone, "daypart": dp, "riders": len(vals), "medianPerHr": round(vals[len(vals) // 2], 1)})
    return {"contributors": len(data), "k": K_ANON, "cells": shown}


# ---------------- HTTP ----------------
class Handler(BaseHTTPRequestHandler):
    server_version = "TrueWage"
    protocol_version = "HTTP/1.0"

    def client_ip(self):
        if TRUST_PROXY:
            fwd = self.headers.get("X-Forwarded-For", "")
            if fwd:
                return fwd.split(",")[0].strip()
        return self.client_address[0]

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        super().end_headers()

    def _send(self, code, data, ctype, cache="no-store"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", cache)
        self.end_headers()
        self.wfile.write(data)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj).encode(), "application/json")

    def _body(self, limit):
        try:
            n = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("bad Content-Length")
        if n <= 0 or n > limit:
            raise ValueError("body must be 1 byte to %d bytes" % limit)
        if "application/json" not in self.headers.get("Content-Type", ""):
            raise ValueError("Content-Type must be application/json")
        return json.loads(self.rfile.read(n))

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/health":
            return self._json(200, {"ok": True, "ai": bool(API_KEY), "model": MODEL if API_KEY else None})
        if path == "/api/city":
            return self._json(200, city_summary())
        if path.startswith("/api/statement/"):
            rid = path.rsplit("/", 1)[-1]
            rec = read_json(REGISTRY, {}).get(rid) if re.fullmatch(r"TW-[0-9A-F]{12}", rid) else None
            return self._json(200, rec) if rec else self._json(404, {"error": "unknown id"})
        if not STATIC_OK.match(path):
            return self._json(404, {"error": "not found"})
        rel = "index.html" if path == "/" else path.lstrip("/")
        try:
            with open(os.path.join(ROOT, rel), "rb") as f:
                data = f.read()
        except OSError:
            return self._json(404, {"error": "not found"})
        self._send(200, data, MIME.get(os.path.splitext(rel)[1], "application/octet-stream"), cache="no-cache")

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        path, ip = self.path.split("?", 1)[0], self.client_ip()
        try:
            if path == "/api/extract":
                if not API_KEY:
                    return self._json(503, {"error": "Claude vision is not configured on this server"})
                if not rate_ok("extract", ip):
                    return self._json(429, {"error": "too many requests, try again later"})
                body = self._body(MAX_BODY)
                return self._json(200, call_claude(body.get("images")))
            if path == "/api/statement":
                if not rate_ok("statement", ip):
                    return self._json(429, {"error": "too many requests"})
                body = self._body(80_000)
                sid, h = str(body.get("id", "")), str(body.get("hash", ""))
                if not (re.fullmatch(r"TW-[0-9A-F]{12}", sid) and re.fullmatch(r"[0-9a-f]{64}", h) and sid == "TW-" + h[:12].upper()):
                    return self._json(400, {"error": "id must be derived from the hash"})
                data = body.get("data") if isinstance(body.get("data"), dict) else None
                with _lock:
                    reg = read_json(REGISTRY, {})
                    if len(reg) >= 50000:
                        return self._json(507, {"error": "registry full"})
                    reg.setdefault(sid, {"hash": h, "data": data, "created": date.today().isoformat()})
                    write_json_atomic(REGISTRY, reg)
                return self._json(200, {"ok": True})
            if path == "/api/contribute":
                if not rate_ok("contribute", ip):
                    return self._json(429, {"error": "too many requests"})
                body = self._body(120_000)
                if body.get("demo"):
                    return self._json(200, {"ok": True, "stored": False, "reason": "simulated sample data is never counted"})
                rid = str(body.get("rid", ""))
                if not re.fullmatch(r"[0-9a-f]{24}", rid):
                    return self._json(400, {"error": "invalid contributor id"})
                cells = clean_cells(body.get("cells"))
                if not cells:
                    return self._json(400, {"error": "no valid cells"})
                with _lock:
                    data = read_json(CONTRIB, {})
                    if rid not in data and len(data) >= 100000:
                        return self._json(507, {"error": "full"})
                    data[rid] = {"cells": cells, "ts": int(time.time())}  # one record per contributor; resubmitting replaces it
                    write_json_atomic(CONTRIB, data)
                return self._json(200, {"ok": True, "stored": True})
        except (ValueError, KeyError, TypeError) as e:
            return self._json(400, {"error": str(e)})
        except urllib.error.HTTPError as e:
            print("model API error:", e.code, file=sys.stderr)
            return self._json(502, {"error": "the vision service rejected the request"})
        except Exception as e:  # keep serving; the client falls back to on-device OCR
            print("server error:", type(e).__name__, file=sys.stderr)
            return self._json(502, {"error": "upstream failure"})
        return self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    port, host = int(os.environ.get("PORT", 8080)), os.environ.get("HOST", "0.0.0.0")
    print("TrueWage on http://%s:%d  (Claude vision: %s, data: %s)" % (host, port, "ON" if API_KEY else "off, on-device OCR fallback", DATA_DIR))
    ThreadingHTTPServer((host, port), Handler).serve_forever()
