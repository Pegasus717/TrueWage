"""Account tests: python -m unittest discover -s tests   (real server on a free port, temp data dir, stdlib only)."""
import os as _os
_os.environ["TRUEWAGE_DB"] = "sqlite"       # tests never touch a hosted database, whatever .env says
import http.client, json, os, sqlite3, sys, tempfile, threading, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TRUEWAGE_DATA", tempfile.mkdtemp())
import accounts, server  # noqa: E402
from http.server import ThreadingHTTPServer  # noqa: E402

SESSION = {"id": "s1", "date": "2026-11-13", "platform": "Zomato", "onlineMin": 300, "bonus": 0, "source": "ocr",
           "orders": [{"hour": 18.1, "zone": "Madhapur", "km": 2.7, "pay": 46, "incentive": 6, "deduction": 0, "durMin": 14}]}


class Client:
    """A browser: keeps cookies, always sends the CSRF header like the app does."""
    def __init__(self, port):
        self.port, self.cookie = port, None

    def call(self, method, path, body=None, headers=None, csrf=True):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        h = {"Content-Type": "application/json"}
        if csrf:
            h["X-TW"] = "1"
        if self.cookie:
            h["Cookie"] = self.cookie
        h.update(headers or {})
        c.request(method, path, body=json.dumps(body).encode() if body is not None else None, headers=h)
        r = c.getresponse(); raw = r.read(); c.close()
        sc = r.getheader("Set-Cookie")
        if sc:
            self.cookie = None if "Max-Age=0" in sc else sc.split(";")[0]
        try:
            return r.status, json.loads(raw), r
        except ValueError:
            return r.status, raw, r


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.n = 0

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def phone(self):
        T.n += 1
        return "98%08d" % (T.n + 1000)

    def signup(self, name="Ravi", phone=None, pw="correct horse"):
        server._hits.clear(); c = Client(self.port); phone = phone or self.phone()
        s, j, r = c.call("POST", "/api/auth/register", {"name": name, "phone": phone, "password": pw, "lang": "te"})
        self.assertEqual(s, 200, j); return c, phone, pw, j, r

    # ---- registration ----
    def test_register_sets_secure_cookie_and_hides_secrets(self):
        c, phone, pw, j, r = self.signup()
        cookie = r.getheader("Set-Cookie")
        self.assertIn("HttpOnly", cookie); self.assertIn("SameSite=Strict", cookie); self.assertIn("Max-Age=2592000", cookie)
        blob = json.dumps(j)
        self.assertNotIn(pw, blob); self.assertNotIn(phone, blob); self.assertEqual(j["user"]["phoneMasked"], "XXXXXX" + phone[-4:])
        self.assertEqual(j["user"]["lang"], "te")

    def test_register_validation(self):
        c = Client(self.port)
        for body, code in [({"name": "", "phone": "9876543210", "password": "longenough1"}, "bad_name"),
                           ({"name": "A", "phone": "12345", "password": "longenough1"}, "bad_phone"),
                           ({"name": "A", "phone": "5876543210", "password": "longenough1"}, "bad_phone"),
                           ({"name": "A", "phone": "9876543210", "password": "short"}, "bad_password"),
                           ({"name": "A", "phone": "9876543210", "password": 12345678}, "bad_password")]:
            s, j, _ = c.call("POST", "/api/auth/register", body); self.assertEqual((s, j["error"]), (400, code), body)

    def test_phone_formats_normalise_and_duplicates_rejected(self):
        c, phone, pw, _, _ = self.signup()
        for variant in ["+91" + phone, "91 " + phone[:5] + " " + phone[5:], "0" + phone]:
            s, j, _ = Client(self.port).call("POST", "/api/auth/register", {"name": "X", "phone": variant, "password": "another pass 1"})
            self.assertEqual((s, j["error"]), (409, "phone_exists"), variant)

    def test_password_is_hashed_not_stored(self):
        c, phone, pw, _, _ = self.signup()
        with sqlite3.connect(os.path.join(server.DATA_DIR, "truewage.db")) as db:
            stored = db.execute("SELECT pw FROM users WHERE phone=?", (phone,)).fetchone()[0]
        self.assertTrue(stored.startswith("scrypt$")); self.assertNotIn(pw, stored)
        a, b = accounts.hash_password("same"), accounts.hash_password("same")
        self.assertNotEqual(a, b)                      # random salt
        self.assertTrue(accounts.verify_password("same", a)); self.assertFalse(accounts.verify_password("other", a))

    # ---- login / logout / sessions ----
    def test_login_logout_cycle(self):
        c, phone, pw, _, _ = self.signup()
        self.assertEqual(c.call("GET", "/api/me")[0], 200)
        self.assertEqual(c.call("POST", "/api/auth/logout")[0], 200)
        self.assertEqual(c.call("GET", "/api/me")[0], 401)                      # cookie cleared
        c2 = Client(self.port)
        s, j, _ = c2.call("POST", "/api/auth/login", {"phone": phone, "password": pw}); self.assertEqual(s, 200)
        self.assertEqual(j["user"]["name"], "Ravi"); self.assertEqual(c2.call("GET", "/api/me")[0], 200)

    def test_logout_invalidates_the_token_server_side(self):
        c, phone, pw, _, _ = self.signup()
        stolen = c.cookie; c.call("POST", "/api/auth/logout")
        thief = Client(self.port); thief.cookie = stolen
        self.assertEqual(thief.call("GET", "/api/me")[0], 401)

    def test_wrong_credentials_are_indistinguishable(self):
        c, phone, pw, _, _ = self.signup()
        x = Client(self.port)
        a = x.call("POST", "/api/auth/login", {"phone": phone, "password": "wrong password"})
        b = x.call("POST", "/api/auth/login", {"phone": "9000000000", "password": "wrong password"})   # unknown phone
        self.assertEqual((a[0], a[1]), (401, {"error": "bad_credentials"})); self.assertEqual((b[0], b[1]), (401, {"error": "bad_credentials"}))
        self.assertEqual(x.call("POST", "/api/auth/login", {"phone": "bad", "password": "x"})[1], {"error": "bad_credentials"})

    def test_brute_force_lockout(self):
        c, phone, pw, _, _ = self.signup()
        x = Client(self.port)
        for _ in range(5):
            self.assertEqual(x.call("POST", "/api/auth/login", {"phone": phone, "password": "nope nope"})[0], 401)
        s, j, r = x.call("POST", "/api/auth/login", {"phone": phone, "password": pw})      # even the right password is refused while locked
        self.assertEqual((s, j["error"]), (429, "locked")); self.assertTrue(int(r.getheader("Retry-After")) > 0)

    # ---- CSRF ----
    def test_csrf_header_required_and_origin_checked(self):
        c, phone, pw, _, _ = self.signup()
        self.assertEqual(c.call("POST", "/api/auth/logout", csrf=False)[0], 403)
        self.assertEqual(c.call("PUT", "/api/me/data", {"data": {}, "baseVersion": 0}, csrf=False)[0], 403)
        self.assertEqual(c.call("POST", "/api/auth/logout", headers={"Origin": "https://evil.example"})[0], 403)
        self.assertEqual(c.call("GET", "/api/me")[0], 200)                               # still signed in: nothing above took effect

    # ---- per-user data ----
    def test_data_roundtrip_and_versioning(self):
        c, *_ = self.signup()
        s, j, _ = c.call("GET", "/api/me"); self.assertEqual((j["data"], j["version"]), ({}, 0))
        s, j, _ = c.call("PUT", "/api/me/data", {"data": {"sessions": [SESSION], "goal": 900, "city": "Bengaluru"}, "baseVersion": 0}); self.assertEqual((s, j["version"]), (200, 1))
        s, j, _ = c.call("GET", "/api/me"); self.assertEqual(j["version"], 1)
        self.assertEqual(j["data"]["sessions"][0]["orders"][0]["pay"], 46); self.assertEqual(j["data"]["city"], "Bengaluru")
        s, j, _ = c.call("PUT", "/api/me/data", {"data": {"goal": 1}, "baseVersion": 0}); self.assertEqual((s, j["error"]), (409, "conflict"))   # stale write refused

    def test_users_cannot_see_each_others_data(self):
        a, *_ = self.signup("Alice"); b, *_ = self.signup("Bob")
        a.call("PUT", "/api/me/data", {"data": {"sessions": [SESSION], "rider": {"name": "Alice", "phone4": "1111"}}, "baseVersion": 0})
        sb = b.call("GET", "/api/me")[1]; self.assertEqual(sb["data"], {}); self.assertEqual(sb["user"]["name"], "Bob")
        sa = a.call("GET", "/api/me")[1]; self.assertEqual(len(sa["data"]["sessions"]), 1)
        b.call("PUT", "/api/me/data", {"data": {"goal": 1500}, "baseVersion": 0})                # Bob writes his own row only
        self.assertNotIn("goal", a.call("GET", "/api/me")[1]["data"])
        # a client-supplied user id is never trusted
        s, j, _ = b.call("PUT", "/api/me/data", {"data": {"goal": 2000}, "baseVersion": 1, "user_id": 1, "userId": 1})
        self.assertEqual(s, 200); self.assertEqual(a.call("GET", "/api/me")[1]["version"], 1)

    def test_unauthenticated_access_refused(self):
        x = Client(self.port)
        self.assertEqual(x.call("GET", "/api/me")[0], 401)
        self.assertEqual(x.call("PUT", "/api/me/data", {"data": {}, "baseVersion": 0})[0], 401)
        self.assertEqual(x.call("DELETE", "/api/me", {"password": "x"})[0], 401)
        self.assertEqual(x.call("POST", "/api/me/password", {"old": "a", "new": "bbbbbbbb"})[0], 401)

    def test_data_is_sanitised_and_bounded(self):
        c, *_ = self.signup()
        bad = dict(SESSION, orders=[dict(SESSION["orders"][0], pay=10 ** 12, km=-5, zone="<b>" + "z" * 200)])
        c.call("PUT", "/api/me/data", {"data": {"sessions": [bad], "profile": {"mileage": "abc", "vehicle": "rocket"}, "lang": "xx", "hashes": ["nothex", "a" * 64]}, "baseVersion": 0})
        d = c.call("GET", "/api/me")[1]["data"]
        o = d["sessions"][0]["orders"][0]
        self.assertEqual((o["pay"], o["km"]), (20000, 0)); self.assertLessEqual(len(o["zone"]), 40)
        self.assertEqual(d["profile"]["vehicle"], "petrol"); self.assertEqual(d["lang"], "en"); self.assertEqual(d["hashes"], ["a" * 64])
        self.assertEqual(c.call("PUT", "/api/me/data", {"data": {"sessions": "nope"}, "baseVersion": 1})[0], 400)
        self.assertEqual(c.call("PUT", "/api/me/data", {"data": {"sessions": [{"date": "bad", "orders": []}]}, "baseVersion": 1})[0], 400)
        self.assertEqual(c.call("PUT", "/api/me/data", {"data": {}, "baseVersion": "0"})[0], 400)

    # ---- password change / deletion ----
    def test_change_password(self):
        c, phone, pw, _, _ = self.signup(); other = Client(self.port); other.call("POST", "/api/auth/login", {"phone": phone, "password": pw})
        self.assertEqual(c.call("POST", "/api/me/password", {"old": "wrong", "new": "brand new pass"})[0], 401)
        self.assertEqual(c.call("POST", "/api/me/password", {"old": pw, "new": "short"})[0], 400)
        self.assertEqual(c.call("POST", "/api/me/password", {"old": pw, "new": "brand new pass"})[0], 200)
        self.assertEqual(c.call("GET", "/api/me")[0], 200)                       # this session stays
        self.assertEqual(other.call("GET", "/api/me")[0], 401)                   # other devices are signed out
        self.assertEqual(Client(self.port).call("POST", "/api/auth/login", {"phone": phone, "password": pw})[0], 401)
        self.assertEqual(Client(self.port).call("POST", "/api/auth/login", {"phone": phone, "password": "brand new pass"})[0], 200)

    def test_delete_account_removes_everything(self):
        c, phone, pw, _, _ = self.signup(); c.call("PUT", "/api/me/data", {"data": {"sessions": [SESSION]}, "baseVersion": 0})
        self.assertEqual(c.call("DELETE", "/api/me", {"password": "wrong"})[0], 401)
        self.assertEqual(c.call("DELETE", "/api/me", {"password": pw})[0], 200)
        self.assertEqual(c.call("GET", "/api/me")[0], 401)
        self.assertEqual(Client(self.port).call("POST", "/api/auth/login", {"phone": phone, "password": pw})[0], 401)
        with sqlite3.connect(os.path.join(server.DATA_DIR, "truewage.db")) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM userdata WHERE user_id NOT IN (SELECT id FROM users)").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM users WHERE phone=?", (phone,)).fetchone()[0], 0)

    # ---- city contributions use a stable anonymous id ----
    def test_contribution_id_is_stable_and_anonymous(self):
        c, *_ = self.signup(); user = c.call("GET", "/api/me")[1]["user"]
        rid = accounts.rider_id(user["id"]); self.assertEqual(rid, accounts.rider_id(user["id"])); self.assertRegex(rid, r"^[0-9a-f]{24}$")
        import hashlib
        self.assertNotEqual(rid, hashlib.sha256(("rid:%d" % user["id"]).encode()).hexdigest()[:24])   # needs the server secret, so it cannot be recomputed from the account id
        cell = [{"platform": "Swiggy", "zone": "Madhapur", "daypart": "evening", "perHr": 100, "hours": 10}]
        server.contrib_reset()
        c.call("POST", "/api/contribute", {"rid": "f" * 24, "cells": cell}); c.call("POST", "/api/contribute", {"rid": "e" * 24, "cells": cell})   # two "devices", one rider
        stored = server.contrib_all()
        self.assertIn(rid, stored); self.assertNotIn("f" * 24, stored); self.assertNotIn("e" * 24, stored)

    def test_static_files_do_not_expose_the_database(self):
        for p in ["/truewage.db", "/accounts.py", "/data/truewage.db", "/secret.key"]:
            self.assertEqual(Client(self.port).call("GET", p)[0], 404, p)


    # ---- history, export, quota over HTTP ----
    def test_history_and_csv_endpoints_are_private_and_safe(self):
        anon = Client(self.port)
        self.assertEqual(anon.call("GET", "/api/me/history")[0], 401); self.assertEqual(anon.call("GET", "/api/me/export.csv")[0], 401)
        c, phone, pw, j, r = self.signup("Hist")
        s, me, _ = c.call("GET", "/api/me"); self.assertEqual(me["ai"]["imagesToday"], 0); self.assertGreater(me["ai"]["imageLimit"], 0)
        c.call("PUT", "/api/me/data", {"baseVersion": me["version"], "data": {"sessions": [SESSION], "expenses": [{"id": "e1", "date": "2026-11-13", "category": "fuel", "amount": 250}]}})
        s, h, _ = c.call("GET", "/api/me/history"); self.assertEqual(s, 200); self.assertEqual(h["stats"]["orders"], 1); self.assertEqual(h["topZones"][0]["zone"], "Madhapur")
        s, raw, resp = c.call("GET", "/api/me/export.csv")
        self.assertEqual(s, 200); self.assertIn("attachment", resp.getheader("Content-Disposition")); self.assertIn(b"order,2026-11-13,Zomato", raw); self.assertIn(b"expense,2026-11-13", raw)
        other, *_ = self.signup("Other")
        s, h2, _ = other.call("GET", "/api/me/history"); self.assertEqual(h2["stats"]["orders"], 0)         # nobody sees another rider's history
        self.assertIn("export", [e["kind"] for e in c.call("GET", "/api/me/history")[1]["events"]])

    def test_user_quota_blocks_extract_before_any_upstream_call(self):
        old_key, old_q = server.API_KEY, accounts.AI_USER_DAILY
        server.API_KEY = "k"; accounts.AI_USER_DAILY = 0
        try:
            c, *_ = self.signup("Quota")
            import base64, struct, zlib
            def ch(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
            png = bytes([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) + ch(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + ch(b"IDAT", zlib.compress(bytes([0, 7, 8, 9]))) + ch(b"IEND", b"")
            s, j, _ = c.call("POST", "/api/extract", {"images": ["data:image/png;base64," + base64.b64encode(png).decode()]})
            self.assertEqual((s, j["error"]), (429, "ai_user_quota"))
        finally:
            server.API_KEY, accounts.AI_USER_DAILY = old_key, old_q

    def test_admin_overview_only_for_listed_riders_and_saves_are_logged(self):
        c, phone, *_ = self.signup("Admin Rider")
        s, j, _ = c.call("GET", "/api/admin/overview"); self.assertEqual((s, j["error"]), (403, "forbidden"))
        self.assertEqual(Client(self.port).call("GET", "/api/admin/overview")[0], 401)
        self.assertFalse(c.call("GET", "/api/me")[1]["user"]["admin"])
        accounts.ADMIN_PHONES.add(phone)
        try:
            me = c.call("GET", "/api/me")[1]; self.assertTrue(me["user"]["admin"])
            c.call("PUT", "/api/me/data", {"baseVersion": me["version"], "data": {"sessions": [SESSION]}})
            s, o, _ = c.call("GET", "/api/admin/overview")
            self.assertEqual(s, 200); self.assertGreaterEqual(o["totals"]["riders"], 1)
            row = [r for r in o["riders"] if r["name"] == "Admin Rider"][0]
            self.assertEqual((row["days"], row["orders"]), (1, 1)); self.assertTrue(row["phone"].startswith("XXXXXX")); self.assertNotIn(phone, json.dumps(o))   # phones are masked
            ev = c.call("GET", "/api/me/history")[1]["events"]
            self.assertTrue(any(e["kind"] == "saved" and "+1 day, +1 orders" in e["detail"] for e in ev))
        finally:
            accounts.ADMIN_PHONES.discard(phone)


class HistoryTests(unittest.TestCase):
    """Relational mirror, history, CSV export and per-rider AI quota."""
    @classmethod
    def setUpClass(cls):
        import accounts
        cls.A = accounts
        cls.uid = accounts.register("History Rider", "9000011111", "password-123", "en")[0]["id"]

    def doc(self, extra=None):
        d = {"sessions": [{"id": "s1", "date": "2026-11-13", "platform": "Rapido", "zone": None, "onlineMin": 300, "bonus": 20, "source": "ai",
                           "orders": [{"hour": 10.5, "zone": "Uppal", "km": 3.0, "pay": 50, "incentive": 5, "deduction": 2, "durMin": 20},
                                      {"hour": 12, "zone": "=cmd|' /C calc'!A0", "km": 2.0, "pay": 40, "incentive": 0, "deduction": 0, "durMin": 15}]}],
             "expenses": [{"id": "e1", "date": "2026-11-13", "category": "fuel", "amount": 300, "litres": 3, "odo": 1000, "note": "+SUM(1)"}, {"id": "e2", "date": "2026-11-13", "category": "bogus", "amount": 0}],
             "shifts": [{"id": "sh1", "date": "2026-11-13", "platform": "Rapido", "startTs": 1, "endTs": 2, "onlineMin": 300, "km": 40, "gps": "on", "zone": "Uppal", "zoneMin": {"Uppal": 200}}]}
        d.update(extra or {}); return d

    def test_mirror_history_and_export(self):
        A = self.A; v = A.put_data(self.uid, self.doc(), 0)
        with A._conn() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM orders WHERE user_id=?", (self.uid,)).fetchone()[0], 2)
            ws = c.execute("SELECT * FROM work_sessions WHERE user_id=?", (self.uid,)).fetchone()
            self.assertEqual((ws["n_orders"], ws["pay"], ws["incentive"], ws["km"]), (2, 90, 5, 5))
            self.assertEqual(c.execute("SELECT COUNT(*) FROM expenses WHERE user_id=?", (self.uid,)).fetchone()[0], 1)   # the zero-amount junk row was dropped
            self.assertEqual(c.execute("SELECT zone FROM shifts WHERE user_id=?", (self.uid,)).fetchone()[0], "Uppal")
        h = A.history(self.uid)
        self.assertEqual((h["stats"]["orders"], h["stats"]["days"]), (2, 1)); self.assertEqual(h["topZones"][0]["zone"], "Uppal")
        kinds = [e["kind"] for e in h["events"]]; self.assertIn("register", kinds)
        out = A.export_csv(self.uid)
        self.assertIn("order,2026-11-13,Rapido,10.5,Uppal", out); self.assertNotIn(",=cmd", out); self.assertIn("'=cmd", out)   # formula injection neutralised
        self.assertIn("'+SUM(1)", out)
        # an unchanged part is not rewritten, a changed one is
        d2 = self.doc(); d2["sessions"][0]["orders"].pop()
        v2 = A.put_data(self.uid, d2, v)
        with A._conn() as c:
            self.assertEqual(c.execute("SELECT COUNT(*) FROM orders WHERE user_id=?", (self.uid,)).fetchone()[0], 1)

    def test_import_and_statement_logs_and_cascade(self):
        A = self.A
        A.log_import(self.uid, "ai", 5, 2, 3, 2, 17, ["claude-haiku-5-5"]); A.log_statement(self.uid, "TW-ABC", "2026-10-01", "2026-11-13", 21000)
        h = A.history(self.uid)
        self.assertEqual(h["imports"][0]["cached"], 2); self.assertEqual(h["statements"][0]["monthly_take_home"], 21000)
        uid2 = A.register("Other", "9000022222", "password-123", "en")[0]["id"]
        A.put_data(uid2, self.doc(), 0)
        A.delete_account(uid2, "password-123")
        with A._conn() as c:
            for t in ("orders", "work_sessions", "expenses", "shifts", "imports", "events", "ai_usage"):
                self.assertEqual(c.execute("SELECT COUNT(*) FROM %s WHERE user_id=?" % t, (uid2,)).fetchone()[0], 0, t)

    def test_ai_quota_is_per_rider_and_hard(self):
        A = self.A; old = A.AI_USER_DAILY
        try:
            A.AI_USER_DAILY = 5
            uid = A.register("Quota", "9000033333", "password-123", "en")[0]["id"]
            A.ai_spend(uid, images=3); A.ai_spend(uid, images=2)
            with self.assertRaises(A.AuthError) as cm: A.ai_spend(uid, images=1)
            self.assertEqual(cm.exception.code, "ai_user_quota"); self.assertEqual(A.ai_usage(uid)["imagesToday"], 5)
            self.assertEqual(A.ai_usage(self.uid)["imagesToday"], 0)       # another rider is unaffected
        finally:
            A.AI_USER_DAILY = old


if __name__ == "__main__":
    unittest.main()
