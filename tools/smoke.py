#!/usr/bin/env python3
"""Smoke-test a running TrueWage deployment:  python tools/smoke.py https://your-domain-or-ip[:port]
Exits non-zero on the first failure. Uses only the standard library."""
import hashlib, json, sys, urllib.error, urllib.request

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
fails = 0


def call(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method, headers={"Content-Type": "application/json"} if data else {})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return r.status, raw, r.headers
    except urllib.error.HTTPError as e:
        return e.code, e.read(), e.headers


def check(name, ok, detail=""):
    global fails
    print(("PASS " if ok else "FAIL ") + name + (" - " + detail if detail and not ok else ""))
    fails += 0 if ok else 1


s, raw, h = call("GET", "/api/health")
check("health endpoint", s == 200 and json.loads(raw).get("ok") is True)
print("     Claude vision:", "ON" if json.loads(raw).get("ai") else "off (on-device OCR fallback)")
s, raw, h = call("GET", "/")
check("app shell served", s == 200 and b"TrueWage" in raw)
check("security headers", h.get("X-Content-Type-Options") == "nosniff" and h.get("X-Frame-Options") == "DENY")
for p in ["/js/app.js", "/js/engine.js", "/css/style.css"]:
    check("static " + p, call("GET", p)[0] == 200)
for p in ["/server.py", "/.env", "/data/registry.json", "/tests/test_server.py", "/Dockerfile"]:
    check("not exposed " + p, call("GET", p)[0] == 404)
payload = {"demo": True, "n": 1}
h256 = hashlib.sha256(json.dumps(payload).encode()).hexdigest()
sid = "TW-" + h256[:12].upper()
check("register statement hash", call("POST", "/api/statement", {"id": sid, "hash": h256, "data": payload})[0] == 200)
s, raw, _ = call("GET", "/api/statement/" + sid)
check("verify statement hash", s == 200 and json.loads(raw)["hash"] == h256)
check("forged id rejected", call("POST", "/api/statement", {"id": "TW-000000000000", "hash": h256})[0] == 400)
s, raw, _ = call("GET", "/api/city")
j = json.loads(raw)
check("city endpoint is k-anonymous", s == 200 and j["k"] == 20 and all(c["riders"] >= 20 for c in j["cells"]))
check("extract fails honestly without a key or bad input", call("POST", "/api/extract", {"images": []})[0] in (400, 503))
print("\n%s" % ("ALL CHECKS PASSED" if not fails else "%d CHECK(S) FAILED" % fails))
sys.exit(1 if fails else 0)
