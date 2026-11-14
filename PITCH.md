# TrueWage: submission playbook

> Platforms show what you earned. TrueWage shows what you actually made.

No one can guarantee a win. What follows is what we can control: a problem judges feel in seconds, a demo that cannot fail, claims that survive questioning, and a finished, honest product. The structure follows widely repeated judging patterns (clear problem, working demo, technical credibility, impact, honesty about limits); it is not a study of specific past winners.

## 1. The 90-second pitch (say it in this order)
1. **Hook (10 s):** "Ravi's app says he earned ₹35,235 this month. He kept ₹20,365. His real pay is ₹81 an hour, not ₹141. Nobody ever showed him that."
2. **Problem (15 s):** Delivery partners and drivers see a headline number that ignores petrol, repairs, data, EMI, unpaid riding and waiting. They can't tell which hours or areas lose money, unions argue without honest data, and riders have no salary slip for a loan.
3. **Demo (45 s):** see section 3.
4. **Why it works (10 s):** It *measures* (screenshots plus a GPS shift tracker for real hours and unpaid kilometres), it's honest (every number has an accuracy range), and it speaks the rider's language, by voice.
5. **Impact and ask (10 s):** Rider gets a plan, union gets anonymous evidence (k ≥ 20), bank gets a verifiable statement. Next: platform-signed data and a pilot with a rider union.

## 2. What judges score, and where we answer it
| Criterion | Our answer (all verifiable in the demo) |
|---|---|
| **Problem and impact** | Hidden wage gap; fair-pay floor per order and per km; union evidence; credit access via a tamper-evident statement |
| **Innovation** | Measured unpaid riding (GPS) replacing the assumption; accuracy range; area-switching advice; order checker that costs a ride the way it costs the rider's day |
| **Technical depth** | One cost model tested to balance exactly; Claude vision plus OCR fallback; grounded Ask (Claude sees only computed numbers); k-anonymity; SHA-256 statements with registry; hardened stdlib server; per-rider accounts (scrypt, HttpOnly session cookie, CSRF header, lockout, versioned sync); 36 Python tests plus an engine suite and a 33-check smoke test |
| **Usability** | Opens in the phone's language, voice questions, one *Next best step*, plan my day, large text, installable; a private dashboard per rider that follows them across phones |
| **Feasibility** | A real product, not a mock-up: accounts, saved data, guest mode; runs today, no dependencies, Docker/Vultr docs, CI |
| **Honesty** | Simulated data is labelled everywhere; self-reported statement says so; limits listed below |

## 3. Three-minute demo script (works without any API key)
0. **Own dashboard (before the clock starts):** in two browser windows create two riders (e.g. Ravi and Sneha), add different data, and show each sees only their own numbers; log out and back in on the second window to show it was saved on the server.
1. **Landing (0:00):** switch to తెలుగు, the page changes. Tap **Demo rider · Bengaluru** (or Hyderabad), or log in to your prepared rider.
2. **The answer (0:15):** "Cash in hand" and the sentence. Open *Show full calculation*: apps' total → cuts → fuel and repairs → data → EMI → cash. Tap *How accurate is this?* for the range.
3. **Measured, not assumed (0:40):** the **shift tracker** card: 64 simulated shifts, unpaid riding *measured* by GPS. A real shift shows a live timer and kilometres.
4. **Do something (1:00):** **Plan my day** (goal ₹800 → an evening window in the best area); the advice card says *move* from the weak lunch area using city data (labelled simulated); tap the speaker.
5. **Ask (1:30):** the floating button; "Should I take ₹40 for 3 km?" → verdict with the maths. Say "voice works too".
6. **Real upload (1:50):** *Add screenshots → Try sample screenshots*; real OCR reads three generated screenshots; review, correct a number, **Save**. Run it again: duplicate skipped.
7. **City and Proof (2:25):** switch Hyderabad/Bengaluru; locked cells under 20 riders; **Proof**: create the statement, open the verify link ✔, edit a number ✖.
8. **Close (2:50):** "One honest number for the rider, the union and the bank."

## 4. Questions judges will ask
* **Can riders fake it?** The statement says *self-reported*, is tamper-evident, carries screenshot hashes, and is not platform- or bank-certified. Roadmap: platform-signed exports or Account-Aggregator-style consent.
* **Are the costs right?** Defaults are editable assumptions; the app shows a range and lets the rider calibrate petrol cost per km; unpaid riding is measured from GPS after 3 paired shifts.
* **Is the city data real?** Hyderabad and Bengaluru are *simulated* demo datasets, labelled on every screen. Live cells appear only at 20+ real contributors.
* **Why not just ask an LLM?** Exact numbers come from the engine, tested to balance to the paisa. The LLM reads screenshots and explains, from computed numbers only; it never calculates an order verdict.
* **How are accounts protected?** Salted scrypt password hashes, random session tokens in HttpOnly SameSite=Strict cookies (only a hash is stored), login throttling, CSRF header, server-side data validation, delete-my-account. Honest gap: no SMS/email verification, so a forgotten password can't be recovered; the roadmap is OTP login.
* **Privacy?** Screenshots are never stored; only the total GPS distance is kept, never the route; sharing sends only platform, area, time band and ₹/hour under a random id.

## 5. Before you submit (checklist)
- [ ] Deploy and put the **live URL** in the submission (`deploy/VULTR.md`; run `python tools/smoke.py <url>`).
- [ ] If you have an Anthropic key, set it, then test one **real** earnings screenshot and the Ask button once before the demo.
- [ ] Test on a **real phone** (GPS shift, voice question, Add to Home screen).
- [ ] Record a 2-minute screen video following section 3; add 4 screenshots from `docs/screens/`.
- [ ] Push the repo; confirm CI is green.
- [ ] Rehearse the pitch twice with a timer.

## 6. Honest status (say it if asked)
* Claude vision and Ask with Claude are tested against a local mock of the API only (no key was available).
* GPS tracking was verified with simulated fixes; offline install and voice input could not be tested in the development browser.
* Docker and Vultr deployment are documented but were not executed.
* Accounts: no SMS/email verification or password recovery; tested locally and by automated tests, not under load or on a real deployment.
* On-device OCR is verified on the bundled sample screenshots only.
