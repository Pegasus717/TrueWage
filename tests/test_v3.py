"""v3 tests: versioned migrations, backup / restore drill, monitoring, and the new rider-data fields.
Run: python -m unittest discover -s tests   (real server on a free port, temp database, stdlib only)."""
import os as _os
_os.environ["TRUEWAGE_DB"] = "sqlite"
import contextlib, gzip, io, json, os, re, sqlite3, sys, tempfile, threading, unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("TRUEWAGE_DATA", tempfile.mkdtemp())
import accounts, backup, monitor, server, store  # noqa: E402
from http.server import ThreadingHTTPServer  # noqa: E402
from test_auth import Client, SESSION  # noqa: E402



def start_server(cls):
    cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
    cls.port = cls.srv.server_address[1]
    threading.Thread(target=cls.srv.serve_forever, daemon=True).start()


class Base(unittest.TestCase):
    n = 0

    @classmethod
    def setUpClass(cls):
        start_server(cls)

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def signup(self, name="Ravi"):
        Base.n += 1
        phone = "95%08d" % (Base.n + 7000)
        server._hits.clear(); accounts._fails.clear()
        c = Client(self.port)
        s, j, _ = c.call("POST", "/api/auth/register", {"name": name, "phone": phone, "password": "correct horse", "lang": "en"})
        self.assertEqual(s, 200, j)
        return c, phone, j["user"]["id"]

    def save(self, c, **doc):
        s, j, _ = c.call("GET", "/api/me")
        s2, j2, _ = c.call("PUT", "/api/me/data", {"data": doc, "baseVersion": j["version"]})
        self.assertEqual(s2, 200, j2)
        return j2


# ======================= migrations =======================
class Migrations(unittest.TestCase):
    def test_fresh_database_is_at_the_latest_version(self):
        self.assertEqual(store.schema_version(), store.SCHEMA_VERSION)
        with store.conn() as c:
            self.assertEqual(store.applied_migrations(c), {v for v, _, _ in store.MIGRATIONS})
            self.assertEqual(store.migrate(c), [])                                  # running again changes nothing

    def test_a_new_migration_runs_once_and_is_recorded(self):
        ran = []
        mig = store.MIGRATIONS + [(901, "test migration", lambda c: ran.append(1))]
        with store.conn() as c:
            self.assertEqual(store.migrate(c, mig), [901])
        with store.conn() as c:
            self.assertEqual(store.migrate(c, mig), [])
            c.execute("DELETE FROM schema_migrations WHERE version=901")
        self.assertEqual(ran, [1])

    def test_a_failing_migration_leaves_no_trace(self):
        def bad(c):
            c.execute("CREATE TABLE half_done(x INTEGER)")
            raise RuntimeError("boom")
        with self.assertRaises(RuntimeError):
            with store.conn() as c:
                store.migrate(c, store.MIGRATIONS + [(902, "bad", bad)])
        with store.conn() as c:
            self.assertNotIn(902, store.applied_migrations(c))
            self.assertIsNone(c.execute("SELECT 1 FROM sqlite_master WHERE name='half_done'").fetchone())

    def test_migrations_apply_in_order(self):
        order = []
        mig = [(911, "b", lambda c: order.append("b")), (910, "a", lambda c: order.append("a"))]
        with store.conn() as c:
            store.migrate(c, mig)
            c.execute("DELETE FROM schema_migrations WHERE version IN (910, 911)")
        self.assertEqual(order, ["a", "b"])

    def test_an_old_database_is_upgraded_and_copied_first(self):
        tmp = tempfile.mkdtemp()
        raw = sqlite3.connect(os.path.join(tmp, "truewage.db"))
        raw.execute("CREATE TABLE users(id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL, pw TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'en', created INTEGER NOT NULL)")
        raw.execute("INSERT INTO users(phone,name,pw,lang,created) VALUES('9000000001','Old Rider','x','en',1)")
        raw.commit(); raw.close()
        home = os.path.dirname(store._path)
        try:
            store.init(tmp)
            with store.conn() as c:
                self.assertIn("recovery", [r["name"] for r in c.execute("PRAGMA table_info(users)").fetchall()])
                self.assertEqual(c.execute("SELECT name FROM users").fetchone()["name"], "Old Rider")
                self.assertIsNotNone(c.execute("SELECT 1 FROM sqlite_master WHERE name='review_stats'").fetchone())
            self.assertEqual(store.schema_version(), store.SCHEMA_VERSION)
            snaps = [n for n in os.listdir(os.path.join(tmp, "backups")) if n.startswith("pre-migrate-")]
            self.assertEqual(len(snaps), 1)
            old = sqlite3.connect(os.path.join(tmp, "backups", snaps[0]))
            self.assertEqual(old.execute("SELECT name FROM users").fetchone()[0], "Old Rider")           # the copy is the database as it was
            self.assertNotIn("recovery", [r[1] for r in old.execute("PRAGMA table_info(users)").fetchall()])
            old.close()
            store.init(tmp)                                                                          # a second start does not copy again
            self.assertEqual(len([n for n in os.listdir(os.path.join(tmp, "backups")) if n.startswith("pre-migrate-")]), 1)
        finally:
            store.init(home)

    def test_a_new_database_is_not_copied(self):
        tmp = tempfile.mkdtemp()
        home = os.path.dirname(store._path)
        try:
            store.init(tmp)
            self.assertFalse(os.path.exists(os.path.join(tmp, "backups")))
        finally:
            store.init(home)


# ======================= backup, restore, drill =======================
class Backups(Base):
    def seed(self):
        c, phone, uid = self.signup("Backup Rider")
        self.save(c, sessions=[SESSION], expenses=[{"id": "e1", "date": "2026-11-13", "category": "fuel", "amount": 300, "litres": 3, "odo": 1000, "note": ""}])
        accounts.log_statement(uid, "TW-AAAAAAAAAAAA", "2026-11-01", "2026-11-13", 9000)
        return c, phone, uid

    def test_dump_has_every_table_but_logins_and_cache(self):
        self.seed()
        d = backup.dump()
        self.assertTrue(backup.check(d))
        for t in ("users", "userdata", "work_sessions", "orders", "expenses", "statements", "events", "kv"):
            self.assertIn(t, d["tables"])
        for t in ("sessions", "extract_cache", "schema_migrations", "error_log"):
            self.assertNotIn(t, d["tables"])
        self.assertEqual(d["schema"], store.SCHEMA_VERSION)
        self.assertEqual(d["counts"]["users"], len(d["tables"]["users"]["rows"]))
        self.assertGreaterEqual(d["counts"]["orders"], 1)

    def test_file_round_trip_and_rejection_of_damage(self):
        self.seed()
        d = backup.dump()
        self.assertEqual(backup.decode(backup.encode(d))["counts"], d["counts"])
        with self.assertRaises(ValueError):
            backup.decode(b"not a backup")
        with self.assertRaises(ValueError):
            backup.decode(gzip.compress(b'{"hello": 1}'))
        cut = json.loads(json.dumps(d)); cut["tables"]["users"]["rows"].pop()                       # a row missing: header no longer matches
        with self.assertRaises(ValueError):
            backup.check(cut)
        odd = json.loads(json.dumps(d)); odd["tables"]["secrets"] = {"columns": [], "rows": []}; odd["counts"]["secrets"] = 0
        with self.assertRaises(ValueError):
            backup.check(odd)
        ragged = json.loads(json.dumps(d)); ragged["tables"]["users"]["rows"][0].append(1)
        with self.assertRaises(ValueError):
            backup.check(ragged)

    def test_restore_drill_passes_on_a_good_dump(self):
        self.seed()
        home = os.path.dirname(store._path)
        r = backup.drill(backup.dump())
        self.assertTrue(r["ok"], r)
        self.assertEqual(r["want"]["users"], r["got"]["users"])
        self.assertEqual(store.schema_version(), store.SCHEMA_VERSION)                              # the live database was untouched
        self.assertEqual(os.path.dirname(store._path), home)

    def test_restore_refuses_a_database_that_has_riders(self):
        self.seed()
        with self.assertRaises(ValueError):
            backup.restore(backup.dump())

    def test_replace_restore_brings_a_deleted_rider_back_with_their_password(self):
        c, phone, uid = self.seed()
        d = backup.dump()
        with store.conn() as db:
            db.execute("DELETE FROM users WHERE id=?", (uid,))
        self.assertEqual(Client(self.port).call("POST", "/api/auth/login", {"phone": phone, "password": "correct horse"})[0], 401)
        backup.restore(d, replace=True)
        server._hits.clear(); accounts._fails.clear()
        c2 = Client(self.port)
        s, j, _ = c2.call("POST", "/api/auth/login", {"phone": phone, "password": "correct horse"})
        self.assertEqual(s, 200, j)
        self.assertEqual(len(j["data"]["sessions"]), 1)                                              # the rider's data came back too
        with store.conn() as db:
            self.assertGreaterEqual(db.execute("SELECT COUNT(*) AS n FROM orders WHERE user_id=?", (uid,)).fetchone()["n"], 1)

    def test_restore_checks_column_names_against_the_live_schema(self):
        self.seed()
        d = backup.dump(); before = d["counts"]["users"]
        d["tables"]["users"]["columns"][1] = "phone) VALUES(1); DROP TABLE users; --"
        with self.assertRaises(ValueError):
            backup.restore(d, replace=True)
        with store.conn() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"], before)  # nothing was deleted: the restore is one transaction

    def test_a_failed_restore_changes_nothing(self):
        self.seed()
        d = backup.dump(); before = d["counts"]["users"]
        d["tables"]["orders"]["columns"].append("nonsense"); [r.append(0) for r in d["tables"]["orders"]["rows"]]
        with self.assertRaises(ValueError):
            backup.restore(d, replace=True)
        with store.conn() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) AS n FROM users").fetchone()["n"], before)

    def test_rotation_keeps_the_newest_and_touches_nothing_else(self):
        tmp = tempfile.mkdtemp()
        for n in ("truewage-backup-20260101-000000.json.gz", "truewage-backup-20260102-000000.json.gz", "truewage-backup-20260103-000000.json.gz", "notes.txt", "other.json.gz"):
            open(os.path.join(tmp, n), "wb").write(b"x")
        gone = backup.rotate(tmp, 2)
        self.assertEqual(gone, ["truewage-backup-20260101-000000.json.gz"])
        self.assertEqual(sorted(os.listdir(tmp)), ["notes.txt", "other.json.gz", "truewage-backup-20260102-000000.json.gz", "truewage-backup-20260103-000000.json.gz"])

    def test_run_once_writes_a_file_and_remembers_when(self):
        self.seed()
        tmp = tempfile.mkdtemp()
        path, counts = backup.run_once(tmp, 3)
        self.assertTrue(os.path.exists(path))
        self.assertEqual(backup.decode(open(path, "rb").read())["counts"], counts)
        self.assertLess(abs(backup.last_backup() - __import__("time").time()), 30)

    def test_sqlite_snapshot_is_a_usable_database(self):
        self.seed()
        dest = os.path.join(tempfile.mkdtemp(), "snap.db")
        backup.snapshot_sqlite(dest)
        db = sqlite3.connect(dest)
        self.assertGreaterEqual(db.execute("SELECT COUNT(*) FROM users").fetchone()[0], 1)
        db.close()

    def test_command_line_verify_and_drill(self):
        self.seed()
        home = os.path.dirname(store._path)
        f = os.path.join(tempfile.mkdtemp(), "b.json.gz")
        backup.write(f)
        out = io.StringIO()
        try:
            with contextlib.redirect_stdout(out):
                self.assertEqual(backup.main(["verify", f]), 0)
                self.assertEqual(backup.main(["drill", f]), 0)
            bad = os.path.join(os.path.dirname(f), "bad.json.gz"); open(bad, "wb").write(b"junk")
            with contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(backup.main(["verify", bad]), 2)
        finally:
            store.init(home)                      # the command line opens its own database as a separate process would; point the shared test store back
        self.assertIn("PASSED", out.getvalue()); self.assertIn("OK:", out.getvalue())

    def test_the_scheduler_is_off_for_hosted_databases_without_a_folder(self):
        saved = store._kind
        try:
            store._kind = "pg"
            os.environ.pop("TRUEWAGE_BACKUP_DIR", None)
            self.assertIsNone(backup.start_scheduler(os.path.dirname(store._path)))
        finally:
            store._kind = saved


# ======================= monitoring =======================
class Monitoring(Base):
    def admin(self):
        c, phone, uid = self.signup("Admin")
        accounts.ADMIN_PHONES.add(phone)
        self.addCleanup(accounts.ADMIN_PHONES.discard, phone)
        return c

    def test_health_is_liveness_and_ready_checks_the_database(self):
        c = Client(self.port)
        s, j, r = c.call("GET", "/api/health")
        self.assertEqual(s, 200); self.assertTrue(j["ok"]); self.assertEqual(j["version"], monitor.VERSION); self.assertIn("uptimeS", j)
        self.assertRegex(r.getheader("X-Request-Id"), r"^[0-9a-f]{12}$")
        s, j, _ = c.call("GET", "/api/health/ready")
        self.assertEqual((s, j["dbOk"]), (200, True)); self.assertIsInstance(j["dbMs"], float)
        self.assertNotIn("users", json.dumps(j))                                                     # nothing about riders on a public endpoint

    def test_ready_reports_503_when_the_database_does_not_answer(self):
        real = monitor.ready
        monitor.ready = lambda: (False, 1.0)
        try:
            self.assertEqual(Client(self.port).call("GET", "/api/health/ready")[0], 503)
            self.assertEqual(Client(self.port).call("GET", "/api/health")[0], 200)                  # the process itself is still alive
        finally:
            monitor.ready = real

    def test_scrub_removes_phone_numbers_urls_and_control_characters(self):
        out = monitor.scrub("failed for 9876543210 at https://x.example/a?token=abc123 \x00 ok order 12345")
        self.assertNotRegex(out, r"\d{6,}"); self.assertNotIn("http", out); self.assertNotIn("\x00", out); self.assertIn("12345", out)
        self.assertLessEqual(len(monitor.scrub("a" * 1000)), 240)

    def test_a_crashing_handler_answers_500_and_is_logged_without_details(self):
        real = server.city_summary
        def boom():
            raise RuntimeError("cannot reach 9876543210")
        server.city_summary = boom
        try:
            s, j, r = Client(self.port).call("GET", "/api/city")
        finally:
            server.city_summary = real
        self.assertEqual(s, 500); self.assertEqual(j["error"], "server_error"); self.assertEqual(j["id"], r.getheader("X-Request-Id"))
        e = monitor.recent_errors(1)[0]
        self.assertEqual((e["kind"], e["route"], e["request_id"]), ("server", "/api/city", j["id"]))
        self.assertIn("RuntimeError", e["message"]); self.assertNotIn("9876543210", e["message"])

    def test_browser_errors_are_stored_scrubbed(self):
        server._hits.clear()
        c = Client(self.port)
        s, _, _ = c.call("POST", "/api/client-error", {"msg": "TypeError: x is undefined for 9876543210", "src": "https://truewage.example/js/app.js?v=9#x", "line": 120, "v": "3.0.0"})
        self.assertEqual(s, 200)
        e = monitor.recent_errors(1)[0]
        self.assertEqual(e["kind"], "client")
        self.assertIn("app.js:120", e["message"]); self.assertIn("v3.0.0", e["message"])
        self.assertNotIn("9876543210", e["message"]); self.assertNotIn("v=9", e["message"])
        n = len(monitor.recent_errors(50))
        self.assertEqual(c.call("POST", "/api/client-error", {"nothing": 1})[0], 200)               # an empty report is ignored, not an error
        self.assertEqual(len(monitor.recent_errors(50)), n)

    def test_browser_error_endpoint_needs_csrf_header_size_limit_and_is_rate_limited(self):
        server._hits.clear()
        c = Client(self.port)
        self.assertEqual(c.call("POST", "/api/client-error", {"msg": "x"}, csrf=False)[0], 403)
        self.assertEqual(c.call("POST", "/api/client-error", {"msg": "x" * 5000})[0], 400)
        server._hits.clear()
        codes = [c.call("POST", "/api/client-error", {"msg": "boom %d" % i})[0] for i in range(22)]
        self.assertEqual(codes[:20], [200] * 20); self.assertEqual(codes[20:], [429, 429])
        server._hits.clear()

    def test_the_error_log_is_capped(self):
        for i in range(60):
            monitor.log_error("client", "browser", "filler %d" % i)
        monitor._inserts = 24; monitor.log_error("client", "browser", "trigger prune")
        with store.conn() as c:
            self.assertLessEqual(c.execute("SELECT COUNT(*) AS n FROM error_log").fetchone()["n"], monitor.KEEP_ERRORS + 1)

    def test_metrics_need_an_admin_or_the_token(self):
        c = Client(self.port)
        self.assertEqual(c.call("GET", "/api/metrics")[0], 401)
        rider, _, _ = self.signup("Plain")
        self.assertEqual(rider.call("GET", "/api/metrics")[0], 403)
        adm = self.admin()
        s, body, r = adm.call("GET", "/api/metrics")
        self.assertEqual(s, 200); self.assertIn("text/plain", r.getheader("Content-Type"))
        text = body.decode()
        for line in ("truewage_up 1", "truewage_db_up 1", "truewage_schema_version %d" % store.SCHEMA_VERSION):
            self.assertIn(line, text)
        self.assertRegex(text, r'truewage_requests_total\{route="GET /api/health"\} \d+')
        server.METRICS_TOKEN = "secret-token-123"
        try:
            self.assertEqual(Client(self.port).call("GET", "/api/metrics", headers={"Authorization": "Bearer secret-token-123"})[0], 200)
            self.assertEqual(Client(self.port).call("GET", "/api/metrics", headers={"Authorization": "Bearer wrong"})[0], 401)
        finally:
            server.METRICS_TOKEN = ""
        self.assertEqual(Client(self.port).call("GET", "/api/metrics", headers={"Authorization": "Bearer "})[0], 401)

    def test_unknown_urls_do_not_create_new_metric_series(self):
        for i in range(5):
            Client(self.port).call("GET", "/api/scan-%d" % i)
        snap = monitor.snapshot()
        self.assertFalse([g for g in snap["routes"] if "scan-" in g])
        self.assertIn("GET /api/other", snap["routes"])

    def test_admin_overview_has_a_system_section(self):
        adm = self.admin()
        monitor.log_error("client", "browser", "visible in admin")
        s, j, _ = adm.call("GET", "/api/admin/overview")
        sy = j["system"]
        self.assertEqual((s, sy["dbOk"], sy["schema"], sy["schemaExpected"]), (200, True, store.SCHEMA_VERSION, store.SCHEMA_VERSION))
        self.assertTrue(any("visible in admin" in e["message"] for e in sy["recentErrors"]))
        self.assertIn("errors", sy); self.assertIn("slowest", sy)
        self.assertNotIn("scrypt", json.dumps(sy))

    def test_admin_backup_download(self):
        server._hits.clear()
        self.assertEqual(Client(self.port).call("GET", "/api/admin/backup")[0], 401)
        rider, _, _ = self.signup("Plain2")
        self.assertEqual(rider.call("GET", "/api/admin/backup")[0], 403)
        adm = self.admin()
        s, blob, r = adm.call("GET", "/api/admin/backup")
        self.assertEqual(s, 200); self.assertIn("attachment", r.getheader("Content-Disposition"))
        d = backup.decode(blob)
        self.assertGreaterEqual(d["counts"]["users"], 2)

    def test_request_log_line_has_no_personal_data(self):
        out = io.StringIO()
        monitor.LOG_REQUESTS = True
        try:
            with contextlib.redirect_stdout(out):
                Client(self.port).call("POST", "/api/auth/login", {"phone": "9876543210", "password": "whatever-pass"})
        finally:
            monitor.LOG_REQUESTS = False
        line = out.getvalue().strip().splitlines()[-1]
        j = json.loads(line)
        self.assertEqual((j["m"], j["r"]), ("POST", "/api/auth/login")); self.assertIn("ms", j)
        self.assertNotIn("9876543210", line); self.assertNotIn("whatever-pass", line); self.assertNotIn("127.0.0.1", line)


# ======================= new rider-data fields =======================
class RiderData(Base):
    def test_payouts_gone_rev_and_cost_profile_are_stored(self):
        c, phone, uid = self.signup()
        sess = dict(SESSION, rev=1700000000000, edited=True)
        self.save(c, sessions=[sess], gone=[{"id": "u-old", "ts": 5}, {"id": "", "ts": 1}],
                  payouts=[{"id": "p1", "platform": "Zomato", "from": "2026-11-02", "to": "2026-11-08", "amount": 1234.5, "note": "weekly"},
                           {"id": "p2", "platform": "Zomato", "from": "2026-11-09", "to": "2026-11-02", "amount": 5},          # to before from: dropped
                           {"id": "p3", "platform": "Swiggy", "from": "bad", "to": "2026-11-02", "amount": 5},                    # not a date: dropped
                           {"id": "p4", "platform": "x" * 99, "from": "2026-11-02", "to": "2026-11-08", "amount": 9e12}],         # clamped
                  profile={"vehicle": "cycle", "ownership": "rented", "traffic": "heavy", "rentPerDay": 350, "detailWear": 1, "tyrePrice": 2400, "tyreLife": 20000, "oilPrice": 500, "oilEvery": 2500, "emiPerMonth": 3000, "insurancePerYear": 3650, "batteryPrice": 0, "batteryLife": 0})
        d = c.call("GET", "/api/me")[1]["data"]
        self.assertEqual(d["sessions"][0]["rev"], 1700000000000); self.assertTrue(d["sessions"][0]["edited"])
        self.assertEqual(d["gone"], [{"id": "u-old", "ts": 5}])
        self.assertEqual([p["id"] for p in d["payouts"]], ["p1", "p4"])
        self.assertEqual(d["payouts"][0]["amount"], 1234.5); self.assertEqual(d["payouts"][1]["amount"], 10000000); self.assertEqual(len(d["payouts"][1]["platform"]), 30)
        p = d["profile"]
        self.assertEqual((p["vehicle"], p["ownership"], p["traffic"]), ("cycle", "rented", "heavy"))
        for k, v in {"rentPerDay": 350, "detailWear": 1, "tyrePrice": 2400, "tyreLife": 20000, "oilPrice": 500, "oilEvery": 2500, "emiPerMonth": 3000, "insurancePerYear": 3650}.items():
            self.assertEqual(p[k], v, k)

    def test_unknown_choices_fall_back_to_safe_defaults(self):
        c, phone, uid = self.signup()
        self.save(c, profile={"vehicle": "rocket", "ownership": "stolen", "traffic": "insane"})
        p = c.call("GET", "/api/me")[1]["data"]["profile"]
        self.assertEqual((p["vehicle"], p["ownership"], p["traffic"]), ("petrol", "owned", "normal"))

    def test_too_many_payouts_or_gone_ids_are_refused(self):
        c, phone, uid = self.signup()
        s, j, _ = c.call("GET", "/api/me")
        for key, val in (("payouts", [{"id": "p", "from": "2026-11-01", "to": "2026-11-02", "amount": 1}] * 601), ("gone", [{"id": str(i)} for i in range(3001)]), ("payouts", "nope")):
            self.assertEqual(c.call("PUT", "/api/me/data", {"data": {key: val}, "baseVersion": j["version"]})[0], 400, key)

    def test_new_languages_are_accepted_and_unknown_ones_fall_back(self):
        for code in ("kn", "mr", "bn"):
            Base.n += 1
            server._hits.clear(); accounts._fails.clear()
            c = Client(self.port)
            s, j, _ = c.call("POST", "/api/auth/register", {"name": "L", "phone": "94%08d" % (Base.n + 9000), "password": "correct horse", "lang": code})
            self.assertEqual((s, j["user"]["lang"]), (200, code))
            self.save(c, lang=code)
            self.assertEqual(c.call("GET", "/api/me")[1]["data"]["lang"], code)
        c, phone, uid = self.signup()
        self.save(c, lang="xx")
        self.assertEqual(c.call("GET", "/api/me")[1]["data"]["lang"], "en")

    def test_the_activity_log_notes_edits(self):
        c, phone, uid = self.signup()
        self.save(c, sessions=[SESSION])
        edited = json.loads(json.dumps(SESSION)); edited["orders"][0]["pay"] = 99
        self.save(c, sessions=[edited])
        with store.conn() as db:
            notes = [r["detail"] for r in db.execute("SELECT detail FROM events WHERE user_id=? AND kind='saved' ORDER BY id", (uid,)).fetchall()]
        self.assertIn("1 day edited", notes[-1])


if __name__ == "__main__":
    unittest.main()
