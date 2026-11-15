"""v2 tests: account recovery, signing out other devices, and measured reading accuracy.
Run: python -m unittest discover -s tests   (real server on a free port, temp database, stdlib only)."""
import os as _os
_os.environ["TRUEWAGE_DB"] = "sqlite"
import os, re, sys, tempfile, threading, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TRUEWAGE_DATA", tempfile.mkdtemp())
import accounts, server  # noqa: E402
from http.server import ThreadingHTTPServer  # noqa: E402
from test_auth import Client  # noqa: E402

CODE_RE = re.compile(r"^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$")


class Recovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.n = 0

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def signup(self, pw="correct horse"):
        Recovery.n += 1
        phone = "97%08d" % (Recovery.n + 5000)
        server._hits.clear(); accounts._fails.clear()
        c = Client(self.port)
        s, j, _ = c.call("POST", "/api/auth/register", {"name": "Ravi", "phone": phone, "password": pw, "lang": "en"})
        self.assertEqual(s, 200, j)
        return c, phone, pw, j

    def recover(self, phone, code, pw="a brand new pass"):
        c = Client(self.port)
        s, j, _ = c.call("POST", "/api/auth/recover", {"phone": phone, "code": code, "password": pw})
        return c, s, j

    # ---- the code itself ----
    def test_register_returns_a_well_formed_code_once(self):
        c, phone, pw, j = self.signup()
        self.assertRegex(j["recoveryCode"], CODE_RE)
        self.assertTrue(j["user"]["recovery"])
        s, me, _ = c.call("GET", "/api/me")                      # the code is never shown again
        self.assertNotIn("recoveryCode", me); self.assertNotIn(j["recoveryCode"], str(me))

    def test_code_is_stored_only_as_a_hash(self):
        c, phone, pw, j = self.signup()
        with accounts._conn() as db:
            stored = db.execute("SELECT recovery FROM users WHERE phone=?", (phone,)).fetchone()["recovery"]
        self.assertTrue(stored.startswith("scrypt$"))
        self.assertNotIn(j["recoveryCode"].replace("-", ""), stored)

    def test_codes_are_unique(self):
        codes = {accounts.new_recovery_code() for _ in range(200)}
        self.assertEqual(len(codes), 200)

    # ---- using it ----
    def test_recover_sets_new_password_rotates_code_and_signs_in(self):
        c, phone, pw, j = self.signup()
        old = j["recoveryCode"]
        c2, s, r = self.recover(phone, old.lower().replace("-", " "))       # typed any way: lower case, spaces
        self.assertEqual(s, 200, r)
        self.assertRegex(r["recoveryCode"], CODE_RE); self.assertNotEqual(r["recoveryCode"], old)
        self.assertEqual(c2.call("GET", "/api/me")[0], 200)                  # signed in straight away
        self.assertEqual(Client(self.port).call("POST", "/api/auth/login", {"phone": phone, "password": pw})[0], 401)           # old password dead
        self.assertEqual(Client(self.port).call("POST", "/api/auth/login", {"phone": phone, "password": "a brand new pass"})[0], 200)
        self.assertEqual(c.call("GET", "/api/me")[0], 401)                   # the old session was closed
        _, s2, _ = self.recover(phone, old, "another pass word")             # a used code cannot be used again
        self.assertEqual(s2, 401)
        _, s3, _ = self.recover(phone, r["recoveryCode"], "third pass word")  # the new one works
        self.assertEqual(s3, 200)

    def test_recover_keeps_the_riders_data(self):
        c, phone, pw, j = self.signup()
        uid = j["user"]["id"]
        doc = {"sessions": [{"id": "s1", "date": "2026-11-13", "platform": "Zomato", "onlineMin": 300, "bonus": 0, "source": "ocr",
                             "orders": [{"hour": 18, "zone": "Madhapur", "km": 2, "pay": 40, "incentive": 0, "deduction": 0, "durMin": 12}]}]}
        self.assertEqual(c.call("PUT", "/api/me/data", {"data": doc, "baseVersion": 0})[0], 200)
        c2, s, r = self.recover(phone, j["recoveryCode"])
        self.assertEqual(s, 200); self.assertEqual(len(r["data"]["sessions"]), 1); self.assertEqual(r["version"], 1)

    def test_wrong_unknown_and_malformed_codes_look_identical(self):
        c, phone, pw, j = self.signup()
        outcomes = []
        for ph, code in ((phone, "AAAAA-AAAAA-AAAAA-AAAAA"), ("9000000000", j["recoveryCode"]), (phone, ""), (phone, "short"), ("123", j["recoveryCode"])):
            _, s, r = self.recover(ph, code)
            outcomes.append((s, r.get("error")))
        self.assertEqual(set(outcomes), {(401, "bad_recovery")})
        self.assertEqual(Client(self.port).call("POST", "/api/auth/login", {"phone": phone, "password": pw})[0], 200)       # nothing changed

    def test_new_password_must_be_strong_enough(self):
        c, phone, pw, j = self.signup()
        _, s, r = self.recover(phone, j["recoveryCode"], "short")
        self.assertEqual((s, r["error"]), (400, "bad_password"))
        _, s, _ = self.recover(phone, j["recoveryCode"])                     # the code was not burned by the rejected attempt
        self.assertEqual(s, 200)

    def test_guessing_is_throttled(self):
        c, phone, pw, j = self.signup()
        for _ in range(5):
            self.assertEqual(self.recover(phone, "AAAAA-AAAAA-AAAAA-AAAAA")[1], 401)
        _, s, r = self.recover(phone, j["recoveryCode"])                     # even the right code waits out the lock
        self.assertEqual((s, r["error"]), (429, "locked"))

    def test_recovery_needs_csrf_header(self):
        c, phone, pw, j = self.signup()
        s, _, _ = Client(self.port).call("POST", "/api/auth/recover", {"phone": phone, "code": j["recoveryCode"], "password": "x" * 10}, csrf=False)
        self.assertEqual(s, 403)

    # ---- accounts made before v2 ----
    def test_old_account_without_a_code_cannot_recover_until_it_makes_one(self):
        c, phone, pw, j = self.signup()
        with accounts._conn() as db:
            db.execute("UPDATE users SET recovery=NULL WHERE phone=?", (phone,))
        self.assertFalse(c.call("GET", "/api/me")[1]["user"]["recovery"])
        self.assertEqual(self.recover(phone, j["recoveryCode"])[1], 401)
        self.assertEqual(c.call("POST", "/api/me/recovery", {"password": "wrong password"})[0], 401)
        s, r, _ = c.call("POST", "/api/me/recovery", {"password": pw})
        self.assertEqual(s, 200); self.assertRegex(r["recoveryCode"], CODE_RE)
        self.assertTrue(c.call("GET", "/api/me")[1]["user"]["recovery"])
        self.assertEqual(self.recover(phone, r["recoveryCode"])[1], 200)

    def test_new_code_replaces_the_old_one(self):
        c, phone, pw, j = self.signup()
        s, r, _ = c.call("POST", "/api/me/recovery", {"password": pw})
        self.assertEqual(self.recover(phone, j["recoveryCode"])[1], 401)
        self.assertEqual(self.recover(phone, r["recoveryCode"])[1], 200)

    # ---- other devices ----
    def test_logout_others_keeps_only_this_session(self):
        c, phone, pw, j = self.signup()
        other = Client(self.port)
        self.assertEqual(other.call("POST", "/api/auth/login", {"phone": phone, "password": pw})[0], 200)
        self.assertEqual(other.call("GET", "/api/me")[0], 200)
        self.assertEqual(c.call("POST", "/api/me/logout-others")[0], 200)
        self.assertEqual(c.call("GET", "/api/me")[0], 200)
        self.assertEqual(other.call("GET", "/api/me")[0], 401)

    def test_logout_others_requires_sign_in(self):
        self.assertEqual(Client(self.port).call("POST", "/api/me/logout-others")[0], 401)


class ReviewAccuracy(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        server._hits.clear(); accounts._fails.clear()
        with accounts._conn() as db:
            db.execute("DELETE FROM review_stats")
        self.c = Client(self.port)
        self.phone = "96%08d" % (id(self) % 10 ** 8)
        s, j, _ = self.c.call("POST", "/api/auth/register", {"name": "Q", "phone": self.phone, "password": "correct horse", "lang": "en"})
        self.assertEqual(s, 200, j)

    def post(self, **kw):
        body = {"reader": "ai", "ordersRead": 10, "ordersUntouched": 8, "ordersRemoved": 1, "ordersAdded": 0, "fieldsRead": 60, "fieldsChanged": 3}
        body.update(kw)
        return self.c.call("POST", "/api/me/review", body)

    def test_needs_sign_in(self):
        self.assertEqual(Client(self.port).call("POST", "/api/me/review", {"reader": "ai"})[0], 401)

    def test_accuracy_is_not_ready_until_enough_fields_are_checked(self):
        self.assertEqual(self.post()[0], 200)
        a = self.c.call("GET", "/api/accuracy")[1]["readers"]["ai"]
        self.assertFalse(a["ready"]); self.assertEqual(a["fields"], 60)

    def test_accuracy_numbers_are_computed_from_the_counts(self):
        self.post(); self.post(ordersRead=20, ordersUntouched=19, ordersRemoved=0, fieldsRead=120, fieldsChanged=1)
        a = self.c.call("GET", "/api/accuracy")[1]["readers"]["ai"]
        self.assertTrue(a["ready"])
        self.assertEqual((a["reviews"], a["orders"], a["ordersUntouched"], a["fields"], a["fieldsChanged"]), (2, 30, 27, 180, 4))
        self.assertAlmostEqual(a["fieldAccuracy"], 1 - 4 / 180, places=4); self.assertAlmostEqual(a["orderAccuracy"], 27 / 30, places=4)

    def test_readers_are_kept_apart(self):
        self.post(reader="ai"); self.post(reader="ocr", ordersUntouched=2, fieldsChanged=30)
        r = self.c.call("GET", "/api/accuracy")[1]["readers"]
        self.assertEqual(set(r), {"ai", "ocr"}); self.assertGreater(r["ai"]["fieldAccuracy"], r["ocr"]["fieldAccuracy"])

    def test_impossible_or_unknown_input_is_refused(self):
        for bad in ({"reader": "demo"}, {"reader": "manual"}, {"ordersUntouched": 9, "ordersRemoved": 3}, {"fieldsChanged": 61}, {"ordersRead": 0, "fieldsRead": 6}):
            self.assertEqual(self.post(**bad)[0], 400, bad)
        self.assertNotIn("ai", self.c.call("GET", "/api/accuracy")[1]["readers"])

    def test_stores_counts_only(self):
        self.post()
        with accounts._conn() as db:
            cols = [r[1] for r in db.execute("PRAGMA table_info(review_stats)").fetchall()]
        self.assertEqual(set(cols), {"id", "user_id", "ts", "reader", "orders_read", "orders_untouched", "orders_removed", "orders_added", "fields_read", "fields_changed"})

    def test_deleting_the_account_deletes_the_counts(self):
        self.post()
        s, _, _ = self.c.call("DELETE", "/api/me", {"password": "correct horse"})
        self.assertEqual(s, 200)
        self.assertEqual(accounts.accuracy(), {})


if __name__ == "__main__":
    unittest.main()
