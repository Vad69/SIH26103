import bcrypt from "bcryptjs";
import db from "./db.js";

const users = [
  {
    name: "Anita Rao",
    email: "admin@mospi.gov.in",
    password: "admin123",
    role: "admin",
  },
  {
    name: "Vikram Mehta",
    email: "pm@mospi.gov.in",
    password: "pm123",
    role: "project_manager",
  },
  {
    name: "Priya Nair",
    email: "pm2@mospi.gov.in",
    password: "pm123",
    role: "project_manager",
  },
  {
    name: "Rahul Sen",
    email: "member@mospi.gov.in",
    password: "member123",
    role: "team_member",
  },
  {
    name: "Sneha Iyer",
    email: "sneha@mospi.gov.in",
    password: "member123",
    role: "team_member",
  },
  {
    name: "Arjun Patel",
    email: "arjun@mospi.gov.in",
    password: "member123",
    role: "team_member",
  },
];

export function seedIfEmpty() {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  if (count > 0) return { seeded: false };

  const insertUser = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  );
  const ids = {};
  for (const u of users) {
    const info = insertUser.run(u.name, u.email, bcrypt.hashSync(u.password, 10), u.role);
    ids[u.email] = info.lastInsertRowid;
  }

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

  const p1 = insertProject.run(
    "PLFS Digital Field Operations",
    "Digitise Periodic Labour Force Survey field capture, validation, and state-wise monitoring for MoSPI.",
    "2026-01-15",
    "2026-09-30",
    "active",
    ids["pm@mospi.gov.in"]
  ).lastInsertRowid;

  const p2 = insertProject.run(
    "CPI Data Pipeline Modernisation",
    "Replace manual CPI compilation steps with a monitored pipeline, including quality gates and delayed-activity alerts.",
    "2025-11-01",
    "2026-06-30",
    "active",
    ids["pm2@mospi.gov.in"]
  ).lastInsertRowid;

  const p3 = insertProject.run(
    "NSS Sample Frame Refresh",
    "Update the national sample frame and publish a completion dashboard for survey operations.",
    "2025-08-01",
    "2026-03-31",
    "active",
    ids["pm@mospi.gov.in"]
  ).lastInsertRowid;

  const p4 = insertProject.run(
    "e-Sankhyiki Portal Hardening",
    "Security, accessibility, and reporting upgrades for the public statistics portal. Marked complete after UAT.",
    "2025-04-01",
    "2025-12-15",
    "completed",
    ids["pm2@mospi.gov.in"]
  ).lastInsertRowid;

  for (const [pid, members] of [
    [p1, ["pm@mospi.gov.in", "member@mospi.gov.in", "sneha@mospi.gov.in"]],
    [p2, ["pm2@mospi.gov.in", "arjun@mospi.gov.in", "sneha@mospi.gov.in"]],
    [p3, ["pm@mospi.gov.in", "member@mospi.gov.in", "arjun@mospi.gov.in"]],
    [p4, ["pm2@mospi.gov.in", "sneha@mospi.gov.in"]],
  ]) {
    for (const email of members) addMember.run(pid, ids[email]);
  }

  const m1a = insertMilestone.run(p1, "CAPI instrument freeze", "2026-03-31", "completed").lastInsertRowid;
  const m1b = insertMilestone.run(p1, "State training complete", "2026-05-15", "in_progress").lastInsertRowid;
  const m1c = insertMilestone.run(p1, "Live dashboard for supervisors", "2026-08-01", "pending").lastInsertRowid;

  insertTask.run(p1, m1a, "Finalise household questionnaire", "Lock CAPI form after cognitive testing.", ids["sneha@mospi.gov.in"], "2026-03-20", "done", "high", 100);
  insertTask.run(p1, m1b, "Train master trainers — East zone", "Two-day workshop plus field shadowing.", ids["member@mospi.gov.in"], "2026-05-10", "in_progress", "critical", 55);
  insertTask.run(p1, m1b, "Issue tablet inventory to states", "Asset tracking and SIM provisioning.", ids["sneha@mospi.gov.in"], "2026-04-30", "todo", "critical", 10);
  insertTask.run(p1, m1b, "Lock enumerator attendance protocol", "Daily check-in so missing field days surface as delay risk.", ids["member@mospi.gov.in"], "2026-05-01", "todo", "critical", 0);
  insertTask.run(p1, m1c, "Supervisor exception reports", "Overdue listing and non-response flags.", ids["sneha@mospi.gov.in"], "2026-07-15", "todo", "high", 5);
  insertTask.run(p1, m1c, "Role-based access for field staff", "PM / supervisor / enumerator roles.", ids["member@mospi.gov.in"], "2026-08-20", "todo", "medium", 0);
  insertTask.run(p1, m1c, "State weekly delay digest", "Email supervisors a 7-day overdue list.", ids["sneha@mospi.gov.in"], "2026-09-08", "todo", "high", 15);

  const m2a = insertMilestone.run(p2, "Source system inventory", "2026-01-15", "completed").lastInsertRowid;
  const m2b = insertMilestone.run(p2, "Quality-gate engine live", "2026-04-01", "in_progress").lastInsertRowid;
  const m2c = insertMilestone.run(p2, "Parallel run vs legacy", "2026-06-01", "pending").lastInsertRowid;

  insertTask.run(p2, m2a, "Catalogue CPI source files", "Document frequency, owner, and lag.", ids["arjun@mospi.gov.in"], "2026-01-10", "done", "medium", 100);
  insertTask.run(p2, m2b, "Implement outlier detection rules", "Flag item-level shocks before aggregation.", ids["sneha@mospi.gov.in"], "2026-03-01", "in_progress", "critical", 40);
  insertTask.run(p2, m2b, "Delayed feed alerts", "Notify when a centre misses the cutoff.", ids["arjun@mospi.gov.in"], "2026-02-15", "todo", "critical", 15);
  insertTask.run(p2, m2c, "Reconcile March index", "Compare pipeline output with published CPI.", ids["sneha@mospi.gov.in"], "2026-06-10", "todo", "high", 0);

  const m3a = insertMilestone.run(p3, "Urban frame update", "2026-01-31", "in_progress").lastInsertRowid;
  const m3b = insertMilestone.run(p3, "Rural PSU recoding", "2026-02-28", "pending").lastInsertRowid;

  insertTask.run(p3, m3a, "Merge census ward boundaries", "GIS join and duplicate check.", ids["member@mospi.gov.in"], "2026-01-20", "in_progress", "high", 60);
  insertTask.run(p3, m3a, "Validate listing counts", "Compare against previous round.", ids["arjun@mospi.gov.in"], "2026-01-05", "todo", "critical", 20);
  insertTask.run(p3, m3b, "Publish sampling note", "Methodology annex for the next NSS round.", ids["member@mospi.gov.in"], "2026-03-20", "todo", "medium", 0);

  insertMilestone.run(p4, "UAT sign-off", "2025-11-30", "completed");
  insertTask.run(p4, null, "WCAG audit fixes", "Contrast and keyboard paths.", ids["sneha@mospi.gov.in"], "2025-10-15", "done", "medium", 100);
  insertTask.run(p4, null, "Load test public APIs", "Peak traffic around release day.", ids["pm2@mospi.gov.in"], "2025-11-01", "done", "high", 100);

  return { seeded: true };
}

if (process.argv[1]?.endsWith("seed.js")) {
  const result = seedIfEmpty();
  console.log(result.seeded ? "Database seeded." : "Database already has users; skip seed.");
}
