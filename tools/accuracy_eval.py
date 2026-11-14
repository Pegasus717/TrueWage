#!/usr/bin/env python3
"""Measure how accurately the AI screenshot reader works on YOUR real screenshots.

    python tools/accuracy_eval.py [http://127.0.0.1:8080] [folder]        (folder default: tests/real)

For every image  name.png / .jpg / .webp  put a file  name.json  next to it with what the screenshot really says:

    {"orders": [{"pay": 52, "km": 3.2}, {"pay": 38, "km": 1.8}],      # what is visible (pay = the rider's earning for that order/trip)
     "count": 14, "total": 3109}                                       # optional: the screen's own totals for partial lists

Each image is sent on its own (so results are attributable) through the running server's /api/extract, exactly like the app does.
Checks per image: sum of pay (within 1 rupee or 1%), number of orders, total distance (within 5%), and "count/total" when given.
Prints a table and an overall accuracy. Needs the server to have ANTHROPIC_API_KEY. Uses at most one AI call per image (cached afterwards).
Use screenshots with names, phone numbers and exact addresses cropped out."""
import base64, glob, json, os, sys, time, urllib.error, urllib.request

base = (sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].startswith("http") else "http://127.0.0.1:8080").rstrip("/")
folder = next((a for a in sys.argv[1:] if not a.startswith("http")), os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tests", "real"))
EXT = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}


def extract(path):
    mime = EXT[os.path.splitext(path)[1].lower()]
    url = "data:%s;base64,%s" % (mime, base64.b64encode(open(path, "rb").read()).decode())
    req = urllib.request.Request(base + "/api/extract", data=json.dumps({"images": [url]}).encode(), method="POST", headers={"Content-Type": "application/json", "X-TW": "1"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": "%d %s" % (e.code, e.read()[:120])}


def close(a, b, tol_abs, tol_rel):
    return abs(a - b) <= max(tol_abs, tol_rel * max(abs(a), abs(b)))


images = sorted(p for p in glob.glob(os.path.join(folder, "*")) if os.path.splitext(p)[1].lower() in EXT)
if not images:
    sys.exit("No images found in %s. Put screenshots there with a matching .json file each (see the top of this script)." % folder)
rows, checks_ok, checks_all = [], 0, 0
for path in images:
    truth_path = os.path.splitext(path)[0] + ".json"
    if not os.path.exists(truth_path):
        print("skip %s (no .json)" % os.path.basename(path)); continue
    truth = json.load(open(truth_path))
    res = extract(path)
    if "error" in res:
        rows.append((os.path.basename(path), "ERROR", res["error"])); checks_all += 1; continue
    got = [o for s in res.get("sessions", []) for o in s["orders"]]
    got_pay = sum(o["pay"] + o["incentive"] for o in got)
    got_km = sum((o["km"] or 0) for o in got)
    res_ok = []
    if "orders" in truth:
        exp_pay = sum(o["pay"] for o in truth["orders"])
        exp_km = sum(o.get("km", 0) for o in truth["orders"])
        res_ok.append(("pay sum", close(got_pay, exp_pay, 1, 0.01), "%.0f vs %.0f" % (got_pay, exp_pay)))
        res_ok.append(("orders", len(got) == len(truth["orders"]), "%d vs %d" % (len(got), len(truth["orders"]))))
        if exp_km:
            res_ok.append(("km sum", close(got_km, exp_km, 0.3, 0.05), "%.1f vs %.1f" % (got_km, exp_km)))
    for s in res.get("sessions", []):
        if "total" in truth:
            res_ok.append(("screen total", s.get("reported_total") is not None and close(s["reported_total"], truth["total"], 1, 0.01), "%s vs %s" % (s.get("reported_total"), truth["total"]))); break
    for name, ok, detail in res_ok:
        rows.append((os.path.basename(path), ("PASS " if ok else "FAIL ") + name, detail)); checks_all += 1; checks_ok += 1 if ok else 0
    time.sleep(0.2)
w = max(len(r[0]) for r in rows) if rows else 10
for r in rows:
    print("%-*s  %-18s %s" % (w, r[0], r[1], r[2]))
if checks_all:
    print("\nAccuracy: %d of %d checks correct (%.0f%%) on %d image(s)" % (checks_ok, checks_all, 100.0 * checks_ok / checks_all, len(images)))
    print("Report this as a measured spot-check on your own sample, with the sample size.")
sys.exit(0 if checks_ok == checks_all else 1)
