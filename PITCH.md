# TrueWage: submission kit

## One-liner
Platforms show what you earned. TrueWage shows what you actually made.

## Submission description
Lakhs of delivery partners and cab drivers see a headline earnings number that ignores petrol, repairs, mobile data, the bike EMI, unpaid riding and hours spent waiting. TrueWage turns screenshots of that earnings screen into **cash in hand** and **real pay per hour**.

The rider uploads screenshots (Claude vision when configured, on-device OCR otherwise), reviews and corrects what was read, and saves. Duplicate screenshots are caught. A ledger then walks from the app's total through cuts, fuel, repairs, data, profit before EMI and the EMI to cash remaining. Advice comes from the rider's own data only, in English, Hindi, Telugu or Tamil with voice, and the app refuses to invent patterns when data is thin. An order checker says take or skip in two seconds, and a what-if simulator shows how hours, areas, platforms and fuel price change monthly cash.

Pooled with consent and a 20-rider anonymity floor, the same data shows unions what pay really looks like by area and time, and a fair-pay floor per order. And riders get a tamper-evident income statement, clearly labelled self-reported, that a lender can verify by QR.

Demo rider (synthetic, labelled as such): apps showed ₹35,235 over 24 days; after all costs the rider kept ₹20,365, about ₹81 an hour against ₹141 implied. Lunch in Kukatpally paid ₹18 an hour; evenings in Madhapur on Zomato paid ₹135.

## 3-minute demo
1. **0:00** Landing. "The apps showed ₹35,235. What did Ravi actually make?" Switch to తెలుగు to show the page change language.
2. **0:20** **Add screenshots → Try sample screenshots.** Real OCR reads three generated test screenshots; the review table appears. Fix a misread bonus, show the red validation on a bad value, **Save**. Run the samples again: "already imported, skipped".
3. **1:00** **See a demo rider.** Cash in hand ₹20,365 and the ledger. Tap a single day. Point at the unpaid-riding note and profit before EMI.
4. **1:25** **Right now** card (set the dropdown to 13:00): slow window, next good one 17:00 to 23:00. Press the speaker on an advice row in Telugu.
5. **1:50** **Insights → What-if.** *Drop weakest windows*: monthly cash falls ₹2,799, real pay per hour rises ₹81 to ₹107 and 3.5 hours a day come back. Fuel +20% costs ₹3,896 a month. Then the **Check order** tab: ₹32 / 4.5 km is *Skip it*; ₹80 / 2 km is *Take it*.
6. **2:20** **City** (labelled simulated): heatmap, "You ₹18/h vs city ₹56/h", locked cells under 20 riders, fair-pay floor.
7. **2:40** **Proof**: create statement, evidence table (self-reported yes, platform/bank certified no), open the verify link ✔, edit a number ✖.

## Why it matters
* **Real problem:** a hidden wage gap for lakhs of workers; no salary slip for credit; no honest data for bargaining.
* **AI does real work:** screenshot → structured orders, in any app layout and language, with human review and honest failure modes.
* **Technically credible:** one correct cost model (tested to balance exactly), consistent simulator, k-anonymous aggregation, hashed statements with registry, hardened server, 14 Python tests and an engine suite.

## Likely questions
* **Can riders fake it?** The statement says self-reported. It is tamper-evident, carries screenshot hashes for audit, and is not platform- or bank-certified. Roadmap: platform-signed exports or Account-Aggregator-style consent.
* **Are the costs right?** They are editable assumptions with sensible defaults; the formula and break-even per km are shown. Calibrating with real contributions is what the city layer is for.
* **City data?** Simulated, labelled on every screen. The demo rider's data is never submitted. Live cells appear only at 20+ distinct contributors.
* **Privacy?** Screenshots are never stored. Sharing sends platform, area, time band and ₹/hour only, under a random anonymous id.

## Honest status
* Claude vision is implemented and tested against a local mock of the API; it has not been run against live screenshots because no key was available during development. On-device OCR is verified on the bundled sample screenshots only.
* Docker and Vultr deployment are documented and the smoke test is provided, but the author has not executed a Vultr deployment.
