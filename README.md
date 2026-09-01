# SIH26103 — Pragati

Web-based integrated **project-monitoring platform** for the Ministry of Statistics and Programme Implementation (Smart Automation).

MVP path:

```text
Login → Dashboard → Projects → Project details
                         ├── Tasks
                         ├── Milestones
                         ├── Team
                         ├── Timeline
                         └── Progress / reports
```

The “intelligent” piece is a small, explainable check — for example *“Project is likely to be delayed because 3 critical tasks are overdue.”* — not a custom ML model.

## Stack

- Frontend: React + Vite + Tailwind CSS + Chart.js
- Backend: Node.js + Express + JWT
- Database: SQLite (`server/data/monitor.db`)

## Run locally

```bash
npm install
npm run install:all
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:3001

## Demo accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | admin@mospi.gov.in | admin123 |
| Project manager | pm@mospi.gov.in | pm123 |
| Team member | member@mospi.gov.in | member123 |

Seed data includes four MoSPI-flavoured projects so the dashboard is not empty on first login.

```bash
npm test
```
