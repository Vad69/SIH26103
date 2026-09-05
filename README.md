# PRAGATI — SIH26103

Prototype **decision-support** for MoSPI-style project monitoring (Smart India Hackathon, Smart Automation). PRAGATI helps an officer see **which projects need attention, why health moved, what a prototype forecast says, what a scenario would do, and what action was recorded**.

It uses **PAIMANA-aligned monitoring concepts** (cost, time, milestones, delay reasons, interventions). It does **not** connect to live PAIMANA, official MoSPI systems, or government APIs. Seeded records are **demo data**.

Working story: **detect → explain → simulate → decide → record → review.**

## Judge path (about 60 seconds)

Log in as **Vardaan** (Admin). Then:

1. **Command center** (`/`) — portfolio snapshot and today’s attention counts.
2. **Decision board** (`/decisions`) — which projects to look at first, and why.
3. Open **PLFS Digital Field Operations**.
4. **Outlook** — rule-based health, **What changed** vs the last review, **What-if** scenario (does not write to the project).
5. Create an **intervention** (decision/action record — it does not by itself “fix” health).
6. Mark it **Completed** and enter an **outcome**.
7. **Decisions** tab — timeline of events, responses, and outcomes (refresh to confirm it persists).

## What the numbers mean

| Figure | Meaning |
| --- | --- |
| **System-calculated physical progress** | Average of task progress in this app. Not an official ministry-reported figure. |
| **Reported physical progress** | Optional officer/imported value. Shown separately when present. |
| **Health / risk score** | Rule-based weighted score: schedule 25%, physical 25%, finance 20%, milestones 15%, critical tasks 15%. Bands: ≥80 on track, ≥65 watch, ≥45 at risk, else critical. **Not ML.** |
| **Forecast** | `prototype_trajectory` slippage estimate. **Not** a guaranteed completion date and **not** production ML. |
| **What-if** | In-memory scenario using the same health/forecast rules. **Does not mutate** live project state. |
| **What changed** | Diff vs the last stored review snapshot (PLFS seed includes a prior Watch / 72 snapshot when no reviews exist). |
| **Intervention** | Persistent officer decision/action record (trigger, recommendation, action, owner, due date, status, outcome). Completing it does not rewrite health. |
| **Data source** | `demo` (seed), `imported` (CSV), or `manual`. Not live government records. |
| **NLP bottleneck suggestion** | Naive Bayes on **synthetic** phrases (`pragati-nb-v1-synthetic`). Never overwrites a coded category until an officer accepts it. |

## Stack

- Frontend: React + Vite + Tailwind CSS + Chart.js
- Backend: Node.js + Express + JWT + bcrypt
- Database: SQLite via `node:sqlite` (`server/data/monitor.db`) — acceptable for this localhost prototype

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
npm run build --prefix client
```

## Demo accounts

Exactly **one Admin**. No public signup.

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Vardaan | Admin | vardaan@mospi.gov.in | vardaan123 |
| Ishika Basu | Project manager | ishika@mospi.gov.in | ishika123 |
| Disha Ghosh | Member (read-only) | disha@mospi.gov.in | disha123 |

Role checks run on the **API**. Members receive **HTTP 403** on write endpoints (except non-mutating what-if GET/POST). Client hiding of buttons is not the security layer.

- Admin: full workspace (cannot create a second Admin).
- Project manager: manage only permitted projects.
- Member: read; cannot create/update projects, reviews, or interventions.

## Product surfaces (current)

- **Command center** — filters, portfolio stats, today’s summary (same board builder as Decision board).
- **Decision board** — immediate / at risk / improving / on track; health; trend when a prior review exists; forecast risk; priority reason; recommended action.
- **Project Outlook** — five-factor health, What changed, What-if, create intervention from recommendation.
- **Interventions** — persist trigger / recommended / officer action / owner / due / status / outcome.
- **Decisions** — event → consequence → response → outcome timeline (Gantt stays on **Timeline**).
- **Risk, Finance, Lifecycle, Alerts, Reports, Flash, QPISR** — supporting monitoring and export. PDFs are prototype documents, not official MoSPI reports.

## Honesty constraints (do not claim otherwise)

Not included and not faked: official MoSPI/PAIMANA integration, live government feeds, production ML forecasting, validated predictive accuracy, GIS, satellite imagery, LLM chatbot, blockchain, WhatsApp, extra microservices.

Seed protections: reseeding does **not** overwrite real review history or fabricated “recovery” after an intervention.

## For a technical evaluator

Canonical engines: `server/src/insights.js` (health), `server/src/forecast.js` (trajectory), `server/src/decision.js` (what-changed, what-if, board, timeline, interventions). Tests live under `server/src/*.test.js`.
