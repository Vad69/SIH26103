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
- Database: SQLite via Node’s built-in `node:sqlite` (`server/data/monitor.db`) — no Python, Visual Studio, or `node-gyp`

## Requirements

- Node.js **22.13+** (Node 24 is fine)
- npm 10+

Do **not** run `npm install all`. That tries to install a package named `all`. The script you want is `npm run install:all`.

## Run locally (Windows / macOS / Linux)

From the repo root:

```bat
npm uninstall all
rmdir /s /q server\node_modules
rmdir /s /q client\node_modules
npm install
npm run install:all
npm run dev
```

On macOS/Linux, replace the `rmdir` lines with `rm -rf server/node_modules client/node_modules`.

- App: http://localhost:5173
- API: http://localhost:3001

If a previous install left files locked on Windows (`EPERM`), close other terminals/IDEs using this folder, delete `server\node_modules`, then run `npm run install:all` again.

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
