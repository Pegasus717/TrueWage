#!/usr/bin/env python3
"""Smoke-test a running TrueWage deployment:  python tools/smoke.py https://your-domain-or-ip[:port]
Exits non-zero on the first failure. Uses only the standard library."""
import hashlib, json, sys, urllib.error, urllib.request

base = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
fails = 0


def call(method, path, body=None, cookie=None):
    data = json.dumps(body).encode() if body is not None else None
    hdrs = {"Content-Type": "application/json", "X-TW": "1"} if (data or method in ("PUT", "DELETE")) else {}
    if cookie:
        hdrs["Cookie"] = cookie
    req = urllib.request.Request(base + path, data=data, method=method, headers=hdrs)
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
check("GPS and mic allowed for the app itself", "geolocation=(self)" in (h.get("Permissions-Policy") or "") and "microphone=(self)" in (h.get("Permissions-Policy") or ""))
for p in ["/js/app.js", "/js/engine.js", "/js/ask.js", "/css/style.css", "/manifest.json", "/sw.js", "/icon.svg"]:
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
check("ask fails honestly without a key or bad input", call("POST", "/api/ask", {"q": "hello", "lang": "en", "summary": {}})[0] in (400, 503))
check("extract fails honestly without a key or bad input", call("POST", "/api/extract", {"images": []})[0] in (400, 503))

# ---- accounts: register -> private data -> logout -> login -> delete (leaves nothing behind) ----
import os, random
check("anonymous /api/me is 401", call("GET", "/api/me")[0] == 401)
try:
    urllib.request.urlopen(urllib.request.Request(base + "/api/auth/login", data=b"{}", method="POST", headers={"Content-Type": "application/json"}), timeout=10)
    nohdr = 200
except urllib.error.HTTPError as e:
    nohdr = e.code
check("API write without X-TW header is refused (CSRF)", nohdr == 403)
phone, pw = "9%09d" % random.randrange(10**9), "smoke-" + os.urandom(6).hex()
s, raw, h = call("POST", "/api/auth/register", {"name": "Smoke Test", "phone": phone, "password": pw, "lang": "en"})
ck = (h.get("Set-Cookie") or "").split(";")[0]
flags = (h.get("Set-Cookie") or "")
check("register sets HttpOnly SameSite cookie", s == 200 and "HttpOnly" in flags and "SameSite=Strict" in flags, flags)
s, raw, _ = call("GET", "/api/me", cookie=ck)
check("session works", s == 200 and json.loads(raw)["user"]["name"] == "Smoke Test")
v = json.loads(raw)["version"]
s, raw, _ = call("PUT", "/api/me/data", {"baseVersion": v, "data": {"sessions": [], "lang": "en"}}, cookie=ck)
check("save private data", s == 200 and json.loads(raw)["version"] == v + 1)
s, raw, _ = call("PUT", "/api/me/data", {"baseVersion": v, "data": {"sessions": []}}, cookie=ck)
check("stale write is rejected (409)", s == 409)
s, _, h = call("POST", "/api/auth/logout", {}, cookie=ck)
check("logout", s == 200 and call("GET", "/api/me", cookie=ck)[0] == 401)
check("wrong password is refused", call("POST", "/api/auth/login", {"phone": phone, "password": "wrong-password"})[0] == 401)
s, raw, h = call("POST", "/api/auth/login", {"phone": phone, "password": pw})
ck = (h.get("Set-Cookie") or "").split(";")[0]
check("login returns saved data", s == 200 and json.loads(raw)["version"] == v + 1)
s, _, _ = call("DELETE", "/api/me", {"password": pw}, cookie=ck)
check("delete account", s == 200 and call("POST", "/api/auth/login", {"phone": phone, "password": pw})[0] == 401)
print("\n%s" % ("ALL CHECKS PASSED" if not fails else "%d CHECK(S) FAILED" % fails))
sys.exit(1 if fails else 0)
