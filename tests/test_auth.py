"""Account tests: python -m unittest discover -s tests   (real server on a free port, temp data dir, stdlib only)."""
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
        if os.path.exists(server.CONTRIB): os.remove(server.CONTRIB)
        c.call("POST", "/api/contribute", {"rid": "f" * 24, "cells": cell}); c.call("POST", "/api/contribute", {"rid": "e" * 24, "cells": cell})   # two "devices", one rider
        stored = json.load(open(server.CONTRIB))
        self.assertIn(rid, stored); self.assertNotIn("f" * 24, stored); self.assertNotIn("e" * 24, stored)

    def test_static_files_do_not_expose_the_database(self):
        for p in ["/truewage.db", "/accounts.py", "/data/truewage.db", "/secret.key"]:
            self.assertEqual(Client(self.port).call("GET", p)[0], 404, p)


if __name__ == "__main__":
    unittest.main()
