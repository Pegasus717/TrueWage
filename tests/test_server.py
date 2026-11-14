"""Server tests: python -m unittest discover -s tests   (stdlib only; starts a real server on a free port)."""
import base64, http.client, json, os, struct, sys, tempfile, threading, unittest, zlib

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ["TRUEWAGE_DATA"] = tempfile.mkdtemp()
os.environ.pop("ANTHROPIC_API_KEY", None)
import server  # noqa: E402
from http.server import ThreadingHTTPServer  # noqa: E402


def tiny_png():
    raw = b"\x00\xff\xff\xff"
    def chunk(t, d):
        c = struct.pack(">I", len(d)) + t + d
        return c + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")


class T(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.srv.server_address[1]
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def req(self, method, path, body=None, ctype="application/json"):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=10)
        data = json.dumps(body).encode() if isinstance(body, (dict, list)) else body
        c.request(method, path, body=data, headers={"Content-Type": ctype} if data is not None else {})
        r = c.getresponse(); raw = r.read(); c.close()
        try:
            return r.status, json.loads(raw), r
        except ValueError:
            return r.status, raw, r

    def test_static_whitelist(self):
        self.assertEqual(self.req("GET", "/")[0], 200)
        self.assertEqual(self.req("GET", "/js/engine.js")[0], 200)
        for p in ["/server.py", "/.env", "/tests/test_server.py", "/data/registry.json", "/../server.py", "/js/../server.py", "/README.md"]:
            self.assertEqual(self.req("GET", p)[0], 404, p)

    def test_security_headers(self):
        _, _, r = self.req("GET", "/api/health")
        self.assertEqual(r.getheader("X-Content-Type-Options"), "nosniff")
        self.assertEqual(r.getheader("X-Frame-Options"), "DENY")
        pp = r.getheader("Permissions-Policy")
        self.assertIn("geolocation=(self)", pp)   # the shift tracker needs GPS
        self.assertIn("microphone=(self)", pp)    # voice questions need the mic
        self.assertIn("camera=()", pp)

    def test_health_never_leaks_key(self):
        s, j, _ = self.req("GET", "/api/health")
        self.assertEqual(s, 200); self.assertFalse(j["ai"]); self.assertNotIn("key", json.dumps(j).lower().replace("ai", ""))

    def test_extract_without_key_is_honest(self):
        s, j, _ = self.req("POST", "/api/extract", {"images": []})
        self.assertEqual(s, 503)

    def test_ask_without_key_is_honest(self):
        self.assertEqual(self.req("POST", "/api/ask", {"q": "hello", "lang": "en", "summary": {}})[0], 503)

    def test_pwa_files_served(self):
        for p in ["/manifest.json", "/sw.js", "/icon.svg"]:
            self.assertEqual(self.req("GET", p)[0], 200, p)

    def test_image_validation(self):
        png = "data:image/png;base64," + base64.b64encode(tiny_png()).decode()
        self.assertEqual(len(server.clean_images([png])), 1)
        with self.assertRaises(ValueError): server.clean_images([])
        with self.assertRaises(ValueError): server.clean_images(["data:text/html;base64,PGI+"])
        with self.assertRaises(ValueError): server.clean_images(["data:image/png;base64," + base64.b64encode(b"not an image at all").decode()])
        with self.assertRaises(ValueError): server.clean_images([png] * 13)

    def test_model_output_is_sanitized(self):
        out = server.sanitize_sessions({"sessions": [
            {"platform": "Evil<script>", "date": "tomorrow", "bonus": 1e12, "orders": [
                {"time": "13:05", "zone": "<b>Madhapur</b>" * 20, "km": -5, "pay": 99999, "incentive": "abc", "deduction": 10},
                {"time": "99:99", "pay": 10}, "junk"]},
            {"platform": "Swiggy", "orders": []}, "junk"]})
        self.assertEqual(len(out["sessions"]), 1)
        s = out["sessions"][0]
        self.assertEqual(s["platform"], "Unknown"); self.assertRegex(s["date"], r"^\d{4}-\d{2}-\d{2}$"); self.assertLessEqual(s["bonus"], 20000)
        self.assertEqual(len(s["orders"]), 1); o = s["orders"][0]
        self.assertEqual((o["km"], o["pay"], o["incentive"]), (0, 5000, 0)); self.assertLessEqual(len(o["zone"]), 40)

    def test_statement_registry(self):
        h = "a" * 64; sid = "TW-" + h[:12].upper()
        self.assertEqual(self.req("POST", "/api/statement", {"id": sid, "hash": h, "data": {"x": 1}})[0], 200)
        s, j, _ = self.req("GET", "/api/statement/" + sid)
        self.assertEqual((s, j["hash"]), (200, h))
        self.assertEqual(self.req("POST", "/api/statement", {"id": "TW-000000000000", "hash": h})[0], 400)  # id must derive from hash
        self.assertEqual(self.req("GET", "/api/statement/TW-NOTREAL")[0], 404)
        # first registration wins: a forger cannot replace the stored data
        self.req("POST", "/api/statement", {"id": sid, "hash": h, "data": {"x": 2}})
        self.assertEqual(self.req("GET", "/api/statement/" + sid)[1]["data"], {"x": 1})

    def test_contribute_k_anonymity(self):
        cell = [{"platform": "Swiggy", "zone": "Madhapur", "daypart": "evening", "perHr": 100, "hours": 10}]
        for i in range(19):
            rid = "%024x" % (i + 1)
            self.assertEqual(self.req("POST", "/api/contribute", {"rid": rid, "cells": cell})[0], 200)
        j = self.req("GET", "/api/city")[1]
        self.assertEqual(j["contributors"], 19); self.assertEqual(j["cells"], [])  # 19 riders: nothing revealed
        self.req("POST", "/api/contribute", {"rid": "%024x" % 20, "cells": cell})
        j = self.req("GET", "/api/city")[1]
        self.assertEqual(len(j["cells"]), 1); self.assertEqual(j["cells"][0]["riders"], 20)
        self.assertNotIn('"rid"', json.dumps(j))  # never exposes contributor ids / individual records
        self.req("POST", "/api/contribute", {"rid": "%024x" % 1, "cells": cell})  # resubmitting does not double count
        self.assertEqual(self.req("GET", "/api/city")[1]["contributors"], 20)

    def test_contribute_rejects_bad_and_demo(self):
        self.assertEqual(self.req("POST", "/api/contribute", {"rid": "short", "cells": []})[0], 400)
        s, j, _ = self.req("POST", "/api/contribute", {"rid": "f" * 24, "demo": True, "cells": [{"zone": "X", "daypart": "night", "perHr": 1, "hours": 1}]})
        self.assertEqual((s, j["stored"]), (200, False))

    def test_bad_requests(self):
        self.assertEqual(self.req("POST", "/api/statement", b"{not json", ctype="application/json")[0], 400)
        self.assertEqual(self.req("POST", "/api/statement", b"x=1", ctype="text/plain")[0], 400)
        self.assertEqual(self.req("POST", "/api/nope", {})[0], 404)

    def test_rate_limit(self):
        server._hits.clear()
        codes = [server.rate_ok("extract", "9.9.9.9") for _ in range(25)]
        self.assertEqual(codes.count(True), 20); self.assertFalse(codes[-1])


if __name__ == "__main__":
    unittest.main()
