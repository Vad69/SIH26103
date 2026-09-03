import bcrypt from "bcryptjs";
import db from "./db.js";

export const DEMO_USERS = [
  {
    name: "Vardaan",
    email: "vardaan@mospi.gov.in",
    password: "vardaan123",
    role: "admin",
  },
  {
    name: "Ishika Basu",
    email: "ishika@mospi.gov.in",
    password: "ishika123",
    role: "project_manager",
  },
  {
    name: "Disha Ghosh",
    email: "disha@mospi.gov.in",
    password: "disha123",
    role: "team_member",
  },
];

function hash(password) {
  return bcrypt.hashSync(password, 10);
}

function remapLegacyDemoAccounts() {
  const legacy = [
    { from: "admin@mospi.gov.in", to: DEMO_USERS[0] },
    { from: "pm@mospi.gov.in", to: DEMO_USERS[1] },
    { from: "member@mospi.gov.in", to: DEMO_USERS[2] },
  ];
  const update = db.prepare(
    "UPDATE users SET name = ?, email = ?, password_hash = ?, role = ? WHERE lower(email) = ?"
  );
  for (const row of legacy) {
    const existing = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(row.from);
    const taken = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(row.to.email);
    if (existing && !taken) {
      update.run(row.to.name, row.to.email, hash(row.to.password), row.to.role, row.from);
    }
  }
}

function enforceSingleAdmin() {
  const admins = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id").all();
  for (const extra of admins.slice(1)) {
    db.prepare("UPDATE users SET role = 'team_member' WHERE id = ?").run(extra.id);
  }
  const admin = db.prepare("SELECT * FROM users WHERE role = 'admin' ORDER BY id").get();
  if (admin && admin.email !== DEMO_USERS[0].email && admin.email === "admin@mospi.gov.in") {
    db.prepare("UPDATE users SET name = ?, email = ?, password_hash = ? WHERE id = ?").run(
      DEMO_USERS[0].name,
      DEMO_USERS[0].email,
      hash(DEMO_USERS[0].password),
      admin.id
    );
  }
}

function seedProjects(ids) {
  const insertProject = db.prepare(
    `INSERT INTO projects (name, description, start_date, end_date, status, manager_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const addMember = db.prepare(
    "INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)"
  );
  const insertMilestone = db.prepare(
    "INSERT INTO milestones (project_id, title, due_date, status) VALUES (?, ?, ?, ?)"
  );
  const insertTask = db.prepare(
    `INSERT INTO tasks (project_id, milestone_id, title, description, assignee_id, due_date, status, priority, progress)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const ishika = ids["ishika@mospi.gov.in"];
  const disha = ids["disha@mospi.gov.in"];

  const p1 = insertProject.run(
    "PLFS Digital Field Operations",
    "Digitise Periodic Labour Force Survey field capture, validation, and state-wise monitoring for MoSPI.",
    "2026-01-15",
    "2026-09-30",
    "active",
    ishika
  ).lastInsertRowid;

  const p2 = insertProject.run(
    "CPI Data Pipeline Modernisation",
    "Replace manual CPI compilation steps with a monitored pipeline, including quality gates and delayed-activity alerts.",
    "2025-11-01",
    "2026-06-30",
    "active",
    ishika
  ).lastInsertRowid;

  const p3 = insertProject.run(
    "NSS Sample Frame Refresh",
    "Update the national sample frame and publish a completion dashboard for survey operations.",
    "2025-08-01",
    "2026-03-31",
    "active",
    ishika
  ).lastInsertRowid;

  const p4 = insertProject.run(
    "e-Sankhyiki Portal Hardening",
    "Security, accessibility, and reporting upgrades for the public statistics portal. Marked complete after UAT.",
    "2025-04-01",
    "2025-12-15",
    "completed",
    ishika
  ).lastInsertRowid;

  for (const pid of [p1, p2, p3, p4]) {
    addMember.run(pid, ishika);
    addMember.run(pid, disha);
  }

  const m1a = insertMilestone.run(p1, "CAPI instrument freeze", "2026-03-31", "completed").lastInsertRowid;
  const m1b = insertMilestone.run(p1, "State training complete", "2026-05-15", "in_progress").lastInsertRowid;
  const m1c = insertMilestone.run(p1, "Live dashboard for supervisors", "2026-08-01", "pending").lastInsertRowid;

  insertTask.run(p1, m1a, "Finalise household questionnaire", "Lock CAPI form after cognitive testing.", disha, "2026-03-20", "done", "high", 100);
  insertTask.run(p1, m1b, "Train master trainers — East zone", "Two-day workshop plus field shadowing.", disha, "2026-05-10", "in_progress", "critical", 55);
  insertTask.run(p1, m1b, "Issue tablet inventory to states", "Asset tracking and SIM provisioning.", disha, "2026-04-30", "todo", "critical", 10);
  insertTask.run(p1, m1b, "Lock enumerator attendance protocol", "Daily check-in so missing field days surface as delay risk.", disha, "2026-05-01", "todo", "critical", 0);
  insertTask.run(p1, m1c, "Supervisor exception reports", "Overdue listing and non-response flags.", disha, "2026-07-15", "todo", "high", 5);
  insertTask.run(p1, m1c, "Role-based access for field staff", "PM / supervisor / enumerator roles.", disha, "2026-08-20", "todo", "medium", 0);
  insertTask.run(p1, m1c, "State weekly delay digest", "Email supervisors a 7-day overdue list.", disha, "2026-09-08", "todo", "high", 15);

  const m2a = insertMilestone.run(p2, "Source system inventory", "2026-01-15", "completed").lastInsertRowid;
  const m2b = insertMilestone.run(p2, "Quality-gate engine live", "2026-04-01", "in_progress").lastInsertRowid;
  const m2c = insertMilestone.run(p2, "Parallel run vs legacy", "2026-06-01", "pending").lastInsertRowid;

  insertTask.run(p2, m2a, "Catalogue CPI source files", "Document frequency, owner, and lag.", disha, "2026-01-10", "done", "medium", 100);
  insertTask.run(p2, m2b, "Implement outlier detection rules", "Flag item-level shocks before aggregation.", disha, "2026-03-01", "in_progress", "critical", 40);
  insertTask.run(p2, m2b, "Delayed feed alerts", "Notify when a centre misses the cutoff.", disha, "2026-02-15", "todo", "critical", 15);
  insertTask.run(p2, m2c, "Reconcile March index", "Compare pipeline output with published CPI.", disha, "2026-06-10", "todo", "high", 0);

  const m3a = insertMilestone.run(p3, "Urban frame update", "2026-01-31", "in_progress").lastInsertRowid;
  const m3b = insertMilestone.run(p3, "Rural PSU recoding", "2026-02-28", "pending").lastInsertRowid;

  insertTask.run(p3, m3a, "Merge census ward boundaries", "GIS join and duplicate check.", disha, "2026-01-20", "in_progress", "high", 60);
  insertTask.run(p3, m3a, "Validate listing counts", "Compare against previous round.", disha, "2026-01-05", "todo", "critical", 20);
  insertTask.run(p3, m3b, "Publish sampling note", "Methodology annex for the next NSS round.", disha, "2026-03-20", "todo", "medium", 0);

  insertMilestone.run(p4, "UAT sign-off", "2025-11-30", "completed");
  insertTask.run(p4, null, "WCAG audit fixes", "Contrast and keyboard paths.", disha, "2025-10-15", "done", "medium", 100);
  insertTask.run(p4, null, "Load test public APIs", "Peak traffic around release day.", ishika, "2025-11-01", "done", "high", 100);
}

const PORTFOLIO = [
  {
    name: "PLFS Digital Field Operations",
    code: "MOSPI-PLFS-2026",
    ministry: "Ministry of Statistics and Programme Implementation",
    sector: "Statistics & IT systems",
    state: "All India / Multi-state",
    original_cost: 186,
    revised_cost: 214,
    expenditure: 97,
    original_end_date: "2026-09-30",
    revised_end_date: "2026-12-15",
    delay_reason: "procurement",
    delay_notes: "State tablet tenders slipped two cycles.",
    reported_physical_progress: 34,
    funds_released: 110,
    previous_health_band: "watch",
    preconstructions: [
      {
        name: "State tablet tender / contract approval",
        category: "procurement",
        status: "delayed",
        planned_completion: "2026-04-30",
        actual_completion: "",
        authority: "State DES",
        delay_reason: "procurement",
        remarks: "Two tender cycles slipped; inventory still incomplete.",
      },
      {
        name: "Field protocol statutory sign-off",
        category: "statutory",
        status: "in_progress",
        planned_completion: "2026-06-15",
        actual_completion: "",
        authority: "MoSPI",
        delay_reason: "",
        remarks: "",
      },
      {
        name: "Site / training-centre readiness (East zone)",
        category: "site_readiness",
        status: "blocked",
        planned_completion: "2026-05-01",
        actual_completion: "",
        authority: "State DES",
        delay_reason: "procurement",
        remarks: "Blocked until tablets arrive.",
      },
    ],
    issues: [
      {
        title: "Tablet inventory stuck in state procurement",
        category: "procurement",
        severity: "critical",
        owner: "MoSPI / State DES",
        intervention: "Joint review with state finance departments",
        due_date: "2026-09-30",
        status: "open",
      },
    ],
    interventions: [
      {
        action: "Convene state DES procurement cell; freeze a common rate contract",
        authority: "MoSPI",
        assigned_officer: "Ishika Basu",
        due_date: "2026-09-20",
        priority: "critical",
        status: "in_progress",
      },
    ],
  },
  {
    name: "CPI Data Pipeline Modernisation",
    code: "MOSPI-CPI-2025",
    ministry: "Ministry of Statistics and Programme Implementation",
    sector: "Statistics & IT systems",
    state: "All India / Multi-state",
    original_cost: 142,
    revised_cost: 168,
    expenditure: 88,
    original_end_date: "2026-06-30",
    revised_end_date: "2026-09-30",
    delay_reason: "coordination",
    delay_notes: "Centre feed SLAs not signed with two source ministries.",
    reported_physical_progress: 48,
    funds_released: 102,
    previous_health_band: "watch",
    preconstructions: [
      {
        name: "Inter-ministerial data-sharing approval",
        category: "statutory",
        status: "delayed",
        planned_completion: "2026-02-28",
        actual_completion: "",
        authority: "MoSPI CPI Division",
        delay_reason: "coordination",
        remarks: "SLA addendum still unsigned.",
      },
    ],
    issues: [
      {
        title: "Delayed centre feeds from two source agencies",
        category: "coordination",
        severity: "critical",
        owner: "MoSPI CPI Division",
        intervention: "Inter-ministerial data-sharing memo",
        due_date: "2026-09-15",
        status: "in_progress",
      },
    ],
    interventions: [
      {
        action: "Issue SLA addendum for delayed centres and stand up exception alerts",
        authority: "MoSPI",
        assigned_officer: "Ishika Basu",
        due_date: "2026-09-12",
        priority: "high",
        status: "open",
      },
    ],
  },
  {
    name: "NSS Sample Frame Refresh",
    code: "MOSPI-NSS-2025",
    ministry: "Ministry of Statistics and Programme Implementation",
    sector: "Statistics & IT systems",
    state: "All India / Multi-state",
    original_cost: 98,
    revised_cost: 112,
    expenditure: 41,
    original_end_date: "2026-03-31",
    revised_end_date: "2026-07-31",
    delay_reason: "land_acquisition",
    delay_notes: "Ward-boundary GIS join blocked where municipal layers are incomplete.",
    reported_physical_progress: 40,
    funds_released: 52,
    previous_health_band: "at_risk",
    preconstructions: [
      {
        name: "Municipal ward-layer access (three states)",
        category: "land_acquisition",
        status: "blocked",
        planned_completion: "2026-01-31",
        actual_completion: "",
        authority: "State DES / ULBs",
        delay_reason: "land_acquisition",
        remarks: "GIS layers incomplete.",
      },
    ],
    issues: [
      {
        title: "Municipal ward layers incomplete in three states",
        category: "land_acquisition",
        severity: "high",
        owner: "State DES / ULBs",
        intervention: "State-level GIS coordination",
        due_date: "2026-09-25",
        status: "open",
      },
    ],
    interventions: [],
  },
  {
    name: "e-Sankhyiki Portal Hardening",
    code: "MOSPI-ESANK-2025",
    ministry: "Ministry of Statistics and Programme Implementation",
    sector: "Statistics & IT systems",
    state: "Delhi",
    original_cost: 64,
    revised_cost: 64,
    expenditure: 64,
    original_end_date: "2025-12-15",
    revised_end_date: "2025-12-15",
    delay_reason: "",
    delay_notes: "",
    reported_physical_progress: 100,
    funds_released: 64,
    previous_health_band: "on_track",
    preconstructions: [
      {
        name: "Security / accessibility UAT sign-off",
        category: "statutory",
        status: "completed",
        planned_completion: "2025-11-30",
        actual_completion: "2025-11-30",
        authority: "MoSPI",
        delay_reason: "",
        remarks: "Completed with portal hardening.",
      },
    ],
    issues: [],
    interventions: [],
  },
];

function seedDecisionSupport() {
  const now = new Date().toISOString();
  const update = db.prepare(
    `UPDATE projects SET code=?, ministry=?, sector=?, state=?, original_cost=?, revised_cost=?, expenditure=?,
     original_end_date=?, revised_end_date=?, delay_reason=?, delay_notes=?, data_source='demo',
     reported_physical_progress=?, funds_released=?, previous_health_band=? WHERE name=?`
  );
  const insertIssue = db.prepare(
    `INSERT INTO issues (project_id, title, category, severity, owner, intervention, due_date, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertIv = db.prepare(
    `INSERT INTO interventions (project_id, issue_id, action, authority, assigned_officer, due_date, priority, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const row of PORTFOLIO) {
    const project = db.prepare("SELECT * FROM projects WHERE name = ?").get(row.name);
    if (!project) continue;
    update.run(
      row.code,
      row.ministry,
      row.sector,
      row.state,
      row.original_cost,
      row.revised_cost,
      row.expenditure,
      row.original_end_date,
      row.revised_end_date,
      row.delay_reason,
      row.delay_notes,
      row.reported_physical_progress,
      row.funds_released ?? 0,
      row.previous_health_band,
      row.name
    );
    const issueCount = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE project_id = ?").get(project.id).n;
    if (issueCount === 0) {
      for (const issue of row.issues) {
        const info = insertIssue.run(
          project.id,
          issue.title,
          issue.category,
          issue.severity,
          issue.owner,
          issue.intervention,
          issue.due_date,
          issue.status,
          now
        );
        for (const iv of row.interventions) {
          insertIv.run(
            project.id,
            info.lastInsertRowid,
            iv.action,
            iv.authority,
            iv.assigned_officer,
            iv.due_date,
            iv.priority,
            iv.status,
            now
          );
        }
      }
    }
    const preconCount = db.prepare("SELECT COUNT(*) AS n FROM preconstructions WHERE project_id = ?").get(project.id).n;
    if (preconCount === 0 && row.preconstructions) {
      const insertPre = db.prepare(
        `INSERT INTO preconstructions (project_id, name, category, status, planned_completion, actual_completion, authority, delay_reason, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );
      for (const c of row.preconstructions) {
        insertPre.run(
          project.id,
          c.name,
          c.category,
          c.status,
          c.planned_completion || null,
          c.actual_completion || null,
          c.authority || "",
          c.delay_reason || "",
          c.remarks || ""
        );
      }
    }
  }
}

export function bootstrap() {
  remapLegacyDemoAccounts();
  enforceSingleAdmin();
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin
      ON users(role) WHERE role = 'admin';
  `);

  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return { seeded: false, migrated: true };

  const insertUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  const ids = {};
  for (const u of DEMO_USERS) {
    const info = insertUser.run(u.name, u.email, hash(u.password), u.role);
    ids[u.email] = info.lastInsertRowid;
  }
  seedProjects(ids);
  seedDecisionSupport();
  return { seeded: true };
}

export function seedIfEmpty() {
  const result = bootstrap();
  seedDecisionSupport();
  return result;
}

if (process.argv[1]?.endsWith("seed.js")) {
  const result = bootstrap();
  console.log(result.seeded ? "Database seeded." : "Database already has users; demo accounts remapped if needed.");
}
