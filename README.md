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

The “intelligent” piece is a **Project Risk Intelligence Engine** — explainable scores for schedule, physical progress, finance, milestones and critical tasks. It produces early warnings and recommended interventions. It is not a trained ML model.

The product is framed as a **decision-support / accountability layer** (cost & time overrun, delay reasons, issues, interventions, audit, monthly brief), not a generic task board.

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

There is exactly **one Admin**. The login page does not create users. Vardaan adds members and project managers from **Users** after signing in.

| Name | Role | Email | Password |
| --- | --- | --- | --- |
| Vardaan | Admin | vardaan@mospi.gov.in | vardaan123 |
| Ishika Basu | Project manager | ishika@mospi.gov.in | ishika123 |
| Disha Ghosh | Member (read-only) | disha@mospi.gov.in | disha123 |

If you already ran an older seed, restart the server once: it remaps the previous demo emails to these accounts.

Passwords are hashed with bcrypt. Role checks run on the API (members get **403** on create/edit/delete). The UI only hides buttons.

Seed data includes four MoSPI-flavoured projects so the dashboard is not empty on first login.

```bash
npm test
```
