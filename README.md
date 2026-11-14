# TrueWage

**Platforms show what you earned. TrueWage shows what you actually made.**

Delivery partners and cab drivers on Swiggy, Zomato, Rapido and Ola see a headline earnings number. It ignores petrol, repairs, mobile data, the bike EMI, unpaid riding and the hours spent waiting for orders. TrueWage turns screenshots of the earnings screen into the number that matters: **cash in hand, and real pay per hour**.

| Home | Add screenshots: confirm | Check an order | What-if |
|---|---|---|---|
| ![Home](docs/screens/home-mobile.jpg) | ![Confirm](docs/screens/import-review.jpg) | ![Check order](docs/screens/check-mobile.jpg) | ![What-if](docs/screens/whatif-mobile.jpg) |

> All sample numbers in the screenshots and demo are **simulated** (a synthetic Hyderabad rider, 28 days). The app labels them as such wherever they appear.

## What it does

* **Import in three taps** – *Add screenshots* → choose files → the app reads them and shows one card per screenshot (app, date, orders, total). Tap **Save** to see the result; tap *Edit orders* only if something looks wrong. Upload earnings screenshots (PNG/JPEG/WebP, several at once). Claude vision reads them when a key is configured on the server; otherwise on-device OCR (Tesseract.js) runs in the browser. Nothing is saved until the rider has **reviewed and corrected** the extracted orders. Duplicate screenshots (by SHA-256) and duplicate sessions (same app, day and orders) are detected and skipped. Order-like lines the reader could not parse are counted and shown, not silently dropped. Out-of-range values block saving.
* **Cash in hand** – the home screen answers one question first: how much money did I actually make? A ledger runs from the app's total, through cuts, fuel, repairs, data, **profit before EMI**, the vehicle EMI, to **cash remaining**; every line is drawn as a waterfall step. View the whole period, a typical day or any single day.
* **Evidence-based advice** in English, हिन्दी, తెలుగు and தமிழ், with voice playback: most and least profitable windows, earnings per km, platform comparison, expense breakdown, waiting-time impact, break-even order value. With fewer than ~3 working days of data the app says so and shows no pattern advice.
* **Ask TrueWage** (floating button on every screen) – ask by typing or by **voice** in English, हिन्दी, తెలుగు or தமிழ். With a Claude key the server answers from a compact summary of *your own computed numbers* (no name, phone or screenshots are sent; the model is instructed never to invent numbers). Without a key an on-device engine picks the right result from your data (earnings, best time and place, what to avoid, order offers, costs, platforms, daily goal, fuel-price what-ifs). Every answer says which of the two produced it. Order offers are always computed exactly by the engine, never by the model.
* **Next best step** – one adaptive card on Home (confirm your vehicle → add more days → your next good window → share/proof), so nobody has to work out what to do next.
* **Honest accuracy** – the real hourly pay is shown with a range that reflects how uncertain the cost assumptions are, and a *Real petrol cost (₹/km)* calibration narrows it. Measured values (pay, bonuses, cuts, distance, times, EMI) never vary.
* **Made for phones** – opens in the phone's language on first visit, larger-text mode, installable ("Add to Home screen") with offline support, demo guide for first-time visitors.
* **Check order** (its own tab, for daily use) – enter the pay and distance an app offers and get Take it / Think twice / Skip it with a plain cost breakdown.
* **Insights** – four short panels: *Advice*, *Hours & places*, *Costs*, *What-if* (change hours per window, working days and fuel price; compare current vs projected monthly cash, real pay per hour and hours worked).
* **City** – three panels (*Where & when*, *Fair pay*, *Share*): pooled, anonymous pay by area, time of day and platform, plus a fair-pay floor calculator. The demo ships a **simulated** Hyderabad dataset. Real contributions go to the server; a cell is shown only when **20 or more distinct riders** contributed.
* **Income Proof** – printable statement with SHA-256 tamper detection, a QR code and a registry check. It states plainly that it is **self-reported**, not platform- or bank-certified.
* **Your data** – export/import a JSON backup, delete everything, all in the app.

## Run it (no key, no signup)

```bash
python server.py            # http://localhost:8080   (Python 3.9+, standard library only)
```

Press **See a demo rider**. For the real upload path press **Add screenshots → Try sample screenshots**: the app draws three genuine test screenshots, runs OCR on them, and stages the result for review. Tap a sample to download it, then upload it through the file picker.

Optional Claude vision: copy `.env.example` to `.env`, set `ANTHROPIC_API_KEY`, restart. The key stays on the server.

The front end is also fully static: any static host serves everything except the Claude reader, the statement registry and live city contributions (the UI says so when they are unavailable).

## How the numbers are computed

Each rupee is counted once.

```
gross             = pay + per-order incentive + share of day bonus - platform deductions
fuel              = (paid km + unpaid km) x fuel price / mileage
repairs           = (paid km + unpaid km) x repairs per km
mobile data       = online hours x data cost per hour
operating profit  = gross - fuel - repairs - data                      (before EMI)
EMI               = EMI per day x calendar days in the period, spread over worked days, then by online minutes
cash remaining    = operating profit - EMI
real pay per hour = cash remaining / online hours   (online hours include waiting)
```

* **Unpaid distance** = paid km x an editable factor (default 0.45) for riding to restaurants and back to busy areas. It is part of fuel and repairs, shown as a note, never subtracted twice.
* **Waiting** = the app's online time minus time spent on orders. If a screenshot has no online time the review step warns that waiting is not counted and hourly pay is overstated.
* Defaults (mileage, fuel price, repairs, data, ₹90/h fair-wage line) are **editable assumptions**, not sourced statistics.
* Verified by tests: costs balance to the paisa (`gross - costs = cash`), EMI totals exactly `EMI/day x calendar days`, receipts add up, and the what-if simulator with unchanged inputs reproduces history exactly.

## Tests

```bash
node tests/engine.test.js                   # calculation engine, accuracy range, calibration, Ask intent detection in 4 languages, parser, duplicates, simulator
python -m unittest discover -s tests        # server (19 tests): validation, k-anonymity, registry, static whitelist, rate limit, extraction + Ask flow against a mock model API
python tools/smoke.py http://127.0.0.1:8080 # 21 checks against any running deployment
```

What the tests do **not** prove: accuracy of the real Claude model on real screenshots (the extraction flow is tested against a local mock of the model API), and real-world OCR accuracy on arbitrary app layouts. On the bundled sample screenshots on-device OCR recovered every order and amount in manual testing; one bonus digit was misread, which is exactly why the review step exists.

## Architecture

```
index.html · css/style.css
js/engine.js   pure maths and insight generation (Node-testable): costing, receipts, plan, what-if, statement
js/reader.js   Claude-vision client, Tesseract OCR fallback, parser, duplicate detection, validation
js/ask.js      offline question understanding (intents + numbers, 4 languages)
js/demo.js     synthetic rider month, simulated city data, sample screenshot renderer
js/i18n.js     English / Hindi / Telugu / Tamil strings
js/app.js      UI (light, high-contrast theme; 48 px touch targets; no horizontal scrolling at 390 px)
server.py      static files (whitelist) + API, stdlib only
```

API: `GET /api/health` · `POST /api/extract` · `POST /api/ask` · `POST /api/statement`, `GET /api/statement/<id>` · `POST /api/contribute`, `GET /api/city`.

## Security and privacy

* The API key is read from the environment or an untracked `.env`, never sent to the browser, never logged.
* Only `index.html`, `css/*.css` and `js/*.js` are served; source, data and config files are not reachable (tested).
* Uploads are checked for type, magic bytes, size and count; model output is coerced to a strict schema; per-IP rate limits protect the API key; security headers on every response; atomic file writes.
* Screenshots are never written to disk. The statement registry stores a hash and the statement summary (name and last four digits of phone only if the rider typed them).
* City sharing is opt-in and sends only platform, area, time-of-day and ₹/hour (plus a random anonymous id kept in the browser). Simulated data is never submitted.

## Honest limitations

* The income statement is rider-attested and tamper-evident. It is **not** platform-certified or bank-certified. The next step would be platform-signed exports or an Account-Aggregator-style consent flow.
* A lender needs the registry (server mode) to detect a forged *code*; the static link only detects an *edited number*.
* The what-if assumes each window keeps the pay per hour seen in the rider's own history; extra hours in a window may earn less.
* City analytics shown in the demo are simulated. Live data appears only after 20+ real contributors.
* Voice input needs a browser with the Web Speech API (Chrome on Android works; support for Indian languages depends on the device). Typing always works.
* Offline mode (service worker) is implemented but could not be verified in the development browser pane; test it in Chrome after deploying.
* OCR needs internet once to fetch Tesseract.js and Google Fonts from CDNs.

## Deploy

See [deploy/VULTR.md](deploy/VULTR.md): Docker Compose (with optional automatic HTTPS) or a plain systemd service on a Vultr Ubuntu server. The Dockerfile and compose file have **not been built or run by the author** (Docker was not available in the development environment); CI builds the image and runs `tools/smoke.py` against it.

## Contributing

`engine.js` is pure and has no DOM dependency; add a test in `tests/engine.test.js` for any calculation change.
