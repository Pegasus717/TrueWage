# TrueWage: submission text (copy into the form)

## Project name
TrueWage

## Description (1 to 2 lines)
TrueWage reads a gig worker's earnings screenshots with AI and shows what they really kept after petrol, repairs, data, EMI and waiting time: cash in hand and real pay per hour, in their own language. Each rider gets a private dashboard, history and analytics.

## Live demo URL
https://truewage-0p3b.onrender.com/
(The free host sleeps when idle; the first load can take up to a minute. Use "Demo rider" for an instant tour, or create an account.)

## Public GitHub repository
https://github.com/Pegasus717/TrueWage

## Industry / domain
Fintech and the gig economy: income transparency for delivery partners and cab drivers (Swiggy, Zomato, Rapido, Ola, Uber).

## Tags
Hackathons, Social Impact, Gig Economy, FinTech, AI, Computer Vision, Income Transparency, India, Multilingual

## Tech stack
* **Front end:** plain JavaScript (no build step), installable PWA, English / Hindi / Telugu / Tamil, voice input
* **Back end:** Python 3 standard-library HTTP server (`server.py`, `accounts.py`, `store.py`)
* **Database:** Supabase (hosted PostgreSQL) with Row Level Security; SQLite for local development
* **AI:** Claude vision reads screenshots (Haiku first, Sonnet only for hard images) and answers questions from the rider's own numbers; on-device Tesseract OCR as fallback
* **Hosting:** Render (live link) and Vultr (see below)
* **Quality:** Node and Python test suites (about 50 tests), a smoke test, GitHub Actions CI, a measured-accuracy tool

## Overview

**The problem.** Delivery partners and cab drivers see a headline earnings number in their apps. It ignores petrol, repairs, mobile data, the vehicle EMI, unpaid riding to the next order and hours spent waiting. Riders can't tell which hours or areas lose money, unions argue without honest data, and riders have no salary slip to show a lender.

**The use case.** A rider shares earnings screenshots (or order offers) with TrueWage. They see what they actually kept and their real pay per hour against the fair-wage line, get advice on when and where to work, check any new order before accepting it, and can produce a tamper-evident income statement for a bank.

**How it works.**
1. The rider uploads screenshots; the AI turns any layout into structured orders. The rider reviews anything guessed, then saves.
2. A tested calculation engine counts each rupee once: gross, fuel (measured from fill-ups when logged), repairs, data, EMI, waiting, unpaid distance (measured by GPS shifts).
3. The dashboard shows a fare-meter style result, a speedometer of real vs claimed pay per hour, a best-day-and-time grid, a plan for the day, and answers to questions in the rider's language.
4. Everything is stored per rider in the database (data, history, analytics, imports, statements), with login, private dashboards and CSV export. Anonymous city analytics appear only when 20 or more riders contributed.

## How we used Vultr
> **Fill this in once the Vultr server is running; do not submit this section until it is true.**
The application server runs on a Vultr Cloud Compute instance (Ubuntu, Docker Compose, HTTPS via Caddy), using the repo's `Dockerfile`, `docker-compose.yml` and `deploy/VULTR.md`. The database is Supabase PostgreSQL and AI calls go to the Claude API from the server, so keys never reach the browser. Server URL: `<your Vultr URL>`.

## Team
* Pegasus717 (GitHub): <your full name and role>
* wildwolf06 (GitHub): <teammate's full name and role>

## Honest status (say it if asked)
* The AI reader was spot-checked on a small set of real screenshots; run `python tools/accuracy_eval.py` on your own set and report the number with the sample size.
* Phone number + password login with no SMS/e-mail verification, so a forgotten password cannot be recovered.
* City analytics shown in the demo are simulated and labelled; live cells appear only after 20 real contributors.
