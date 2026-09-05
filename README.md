# SIH26103 — Pragati

Prototype **decision-support** for project monitoring (MoSPI / Smart Automation). It uses **PAIMANA-aligned monitoring concepts** (cost, time, milestones, delay reasons, interventions). It does **not** connect to live PAIMANA, and it does **not** publish official PAIMANA indicators.

The working story is: **detect → explain → prioritize → intervene → track → report.**

## What the numbers mean

| Figure | Meaning |
| --- | --- |
| **System-calculated physical progress** | Average of task progress in this app. Not an official ministry-reported physical-progress figure. |
| **Reported physical progress** | Optional value entered by an officer (or imported). Shown separately when present. |
| **Health / risk score** | Rule-based weighted score (schedule, physical, finance, milestones, critical tasks). Not an ML prediction. |
| **Data source** | `demo` (seeded), `imported` (CSV), or `manual` (created in the UI). Seeded projects are **not** live government records. |

## Stack

- Frontend: React + Vite + Tailwind CSS + Chart.js
- Backend: Node.js + Express + JWT + bcrypt
- Database: SQLite via `node:sqlite` (`server/data/monitor.db`)

## Run locally

Node.js **22.13+**. Do **not** run `npm install all`.

```bash
npm install
npm run install:all
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:3001

```bash
npm test
```

## Demo accounts

Exactly **one Admin**. No public signup.

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Vardaan | Admin | vardaan@mospi.gov.in | vardaan123 |
| Ishika Basu | Project manager | ishika@mospi.gov.in | ishika123 |
| Disha Ghosh | Member (read-only) | disha@mospi.gov.in | disha123 |

Role checks run on the API. Members receive **HTTP 403** on write endpoints even if a request is forged.

## Judge demo flow

1. Log in as Admin.
2. Open the command center; filter by ministry / sector / state / health.
3. Open a high-risk project (Risk tab: factors, band explanation, early warning).
4. Inspect Finance, Issues, and Interventions.
5. Change project status or financials as Admin (validation errors if figures are invalid).
6. Open Users; create a Project Manager and a Member. A second Admin cannot be created.
7. Create a project as Admin (you become manager). Log out.
8. Log in as Ishika (Project Manager). Confirm she can edit her own projects and **cannot** edit the Admin-owned project (403).
9. Log out. Log in as Disha (Member). Confirm read-only UI and that a write request returns **403**.
10. Generate the monthly brief. Open **Outlook** on a Critical project (forecast + NLP suggestion). Inspect **Pre-construction**. Download Flash / QPISR PDF.

## Decision-support add-ons (prototype)

- **Outlook / forecast:** trajectory estimate (not trained ML, not PAIMANA).
- **NLP bottleneck classifier:** Naive Bayes on **synthetic** phrases; suggestions never overwrite a manual category until accepted.
- **Pre-construction clearances** feed health + forecast.
- **Funds released** sits beside sanctioned / anticipated / expenditure.
- **In-app alerts**, **Flash report**, **QPISR-style report** + PDF. Not official government documents.

## Deliberately not included

Live PAIMANA feeds, fake ML, public registration, multiple Admins, email/SMS, GIS, extra chart screens, or features that cannot be shown on localhost.
