import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import db, {
  publicUser,
  enrichProject,
  canAccessProject,
  canManageProject,
  visibleProjectIds,
  todayISO,
  isOverdue,
} from "./db.js";
import { seedIfEmpty } from "./seed.js";
import { analyzeProject } from "./insights.js";
import { authRequired, requireRole, signToken } from "./auth.js";
import { assertCanDeleteUser, normalizeCreatableRole } from "./rbac.js";
import { DELAY_REASONS, MINISTRIES, SECTORS, STATES, delayLabel } from "./constants.js";
import { logAudit, listAudit } from "./audit.js";
import { parseCsv, toCsv } from "./csv.js";

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function projectOr404(id, res) {
  const row = db.prepare("SELECT * FROM projects WHERE id = ?").get(id);
  if (!row) {
    res.status(404).json({ error: "Project not found." });
    return null;
  }
  return row;
}

function intel(project) {
  return analyzeProject({
    project,
    tasks: project.tasks || [],
    milestones: project.milestones || [],
    issues: project.issues || [],
  });
}

function loadVisible(user) {
  return visibleProjectIds(user)
    .map((id) => enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)))
    .filter(Boolean)
    .map((p) => ({ ...p, insights: intel(p) }));
}

function matchesFilters(p, q) {
  if (q.ministry && p.ministry !== q.ministry) return false;
  if (q.sector && p.sector !== q.sector) return false;
  if (q.state && p.state !== q.state) return false;
  if (q.health && p.insights?.health?.band !== q.health) return false;
  if (q.status && p.computed_status !== q.status && p.status !== q.status) return false;
  return true;
}

function projectWriteFields(body, existing = {}) {
  const start = String(body.start_date ?? existing.start_date ?? "");
  const end = String(body.end_date ?? existing.end_date ?? "");
  return {
    name: String(body.name ?? existing.name ?? "").trim(),
    description: String(body.description ?? existing.description ?? ""),
    start_date: start,
    end_date: end,
    status: String(body.status ?? existing.status ?? "planning"),
    code: String(body.code ?? existing.code ?? ""),
    ministry: String(body.ministry ?? existing.ministry ?? ""),
    sector: String(body.sector ?? existing.sector ?? ""),
    state: String(body.state ?? existing.state ?? ""),
    original_cost: Number(body.original_cost ?? existing.original_cost ?? 0),
    revised_cost: Number(body.revised_cost ?? existing.revised_cost ?? 0),
    expenditure: Number(body.expenditure ?? existing.expenditure ?? 0),
    original_end_date: String(body.original_end_date ?? existing.original_end_date ?? start),
    revised_end_date: String(body.revised_end_date ?? existing.revised_end_date ?? end),
    delay_reason: String(body.delay_reason ?? existing.delay_reason ?? ""),
    delay_notes: String(body.delay_notes ?? existing.delay_notes ?? ""),
  };
}

app.post("/api/auth/login", (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const user = db.prepare("SELECT * FROM users WHERE lower(email) = ?").get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Invalid email or password." });
  }
  const safe = publicUser(user);
  res.json({ token: signToken(user), user: safe });
});

app.get("/api/auth/me", authRequired, (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/users", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const rows = db.prepare("SELECT id, name, email, role FROM users ORDER BY name").all();
  res.json(rows);
});

app.post("/api/users", authRequired, requireRole("admin"), (req, res) => {
  const name = String(req.body?.name || "").trim();
  const email = String(req.body?.email || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const parsed = normalizeCreatableRole(req.body?.role);
  if (!parsed.ok) return res.status(403).json({ error: parsed.error });
  if (!name || !email || password.length < 6) {
    return res.status(400).json({ error: "Name, email, and a password of at least 6 characters are required." });
  }
  const exists = db.prepare("SELECT id FROM users WHERE lower(email) = ?").get(email);
  if (exists) return res.status(409).json({ error: "That email is already in use." });
  try {
    const info = db
      .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)")
      .run(name, email, bcrypt.hashSync(password, 10), parsed.role);
    const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(info.lastInsertRowid);
    res.status(201).json(user);
  } catch (err) {
    const message = String(err?.message || err);
    if (message.includes("users_single_admin") || message.includes("UNIQUE")) {
      return res.status(403).json({ error: "A second Admin cannot be created." });
    }
    throw err;
  }
});

app.delete("/api/users/:id", authRequired, requireRole("admin"), (req, res) => {
  const id = parseId(req.params.id);
  const target = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  const allowed = assertCanDeleteUser(req.user, target);
  if (!allowed.ok) return res.status(allowed.status).json({ error: allowed.error });
  const managed = db.prepare("SELECT COUNT(*) AS n FROM projects WHERE manager_id = ?").get(id).n;
  if (managed > 0) {
    return res.status(400).json({
      error: "This project manager still owns projects. Reassign or delete those projects first.",
    });
  }
  db.prepare("DELETE FROM project_members WHERE user_id = ?").run(id);
  db.prepare("UPDATE tasks SET assignee_id = NULL WHERE assignee_id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.get("/api/dashboard", authRequired, (req, res) => {
  const projects = loadVisible(req.user).filter((p) => matchesFilters(p, req.query));
  const buckets = { total: projects.length, active: 0, completed: 0, delayed: 0, planning: 0, on_hold: 0 };
  const health = { on_track: 0, watch: 0, at_risk: 0, critical: 0 };
  let progressSum = 0;
  let original = 0;
  let revised = 0;
  let expenditure = 0;
  const upcoming = [];
  const delayedTasks = [];
  const warnings = [];
  const reasonCounts = {};

  for (const p of projects) {
    const status = p.computed_status;
    if (status === "delayed") buckets.delayed += 1;
    else if (buckets[status] !== undefined) buckets[status] += 1;
    progressSum += p.progress;
    original += Number(p.original_cost || 0);
    revised += Number(p.revised_cost || 0);
    expenditure += Number(p.expenditure || 0);
    const band = p.insights.health.band;
    if (health[band] !== undefined) health[band] += 1;
    if (p.delay_reason) reasonCounts[p.delay_reason] = (reasonCounts[p.delay_reason] || 0) + 1;
    if (p.insights.health.early_warning) {
      warnings.push({
        project_id: p.id,
        project_name: p.name,
        band,
        score: p.insights.health.score,
        message: p.insights.health.early_warning_text,
        reasons: p.insights.health.reasons.slice(0, 4),
      });
    }
    for (const t of p.tasks) {
      if (t.status !== "done" && t.due_date >= todayISO()) {
        upcoming.push({
          id: t.id,
          title: t.title,
          due_date: t.due_date,
          project_id: p.id,
          project_name: p.name,
          priority: t.priority,
        });
      }
      if (isOverdue(t.due_date, t.status === "done")) {
        delayedTasks.push({
          id: t.id,
          title: t.title,
          due_date: t.due_date,
          project_id: p.id,
          project_name: p.name,
          priority: t.priority,
          assignee_name: t.assignee_name,
        });
      }
    }
  }

  upcoming.sort((a, b) => a.due_date.localeCompare(b.due_date));
  delayedTasks.sort((a, b) => a.due_date.localeCompare(b.due_date));
  warnings.sort((a, b) => a.score - b.score);

  const delay_reasons = Object.entries(reasonCounts)
    .map(([id, count]) => ({ id, label: delayLabel(id), count }))
    .sort((a, b) => b.count - a.count);

  const issuesOpen = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE status != 'resolved'").get().n;
  const issuesCritical = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE status != 'resolved' AND severity = 'critical'").get().n;
  const issuesOverdue = db
    .prepare("SELECT COUNT(*) AS n FROM issues WHERE status != 'resolved' AND due_date IS NOT NULL AND due_date < ?")
    .get(todayISO()).n;
  const issuesResolved = db.prepare("SELECT COUNT(*) AS n FROM issues WHERE status = 'resolved'").get().n;

  res.json({
    stats: {
      ...buckets,
      overall_progress: projects.length ? Math.round(progressSum / projects.length) : 0,
      original_cost: Math.round(original * 10) / 10,
      revised_cost: Math.round(revised * 10) / 10,
      expenditure: Math.round(expenditure * 10) / 10,
    },
    health,
    delay_reasons,
    issues: { open: issuesOpen, critical: issuesCritical, overdue: issuesOverdue, resolved: issuesResolved },
    upcoming_deadlines: upcoming.slice(0, 8),
    delayed_tasks: delayedTasks.slice(0, 8),
    early_warnings: warnings.slice(0, 8),
    risk_alerts: warnings.slice(0, 6).map((w) => ({
      project_id: w.project_id,
      project_name: w.project_name,
      headline: { severity: w.band === "critical" ? "high" : "medium", message: w.message },
    })),
    priority_projects: [...projects]
      .sort((a, b) => a.insights.health.score - b.insights.health.score)
      .slice(0, 6)
      .map((p) => ({
        id: p.id,
        name: p.name,
        band: p.insights.health.band,
        score: p.insights.health.score,
        ministry: p.ministry,
        cost_overrun_pct: p.insights.finance.cost_overrun_pct,
      })),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      computed_status: p.computed_status,
      progress: p.progress,
      planned_progress: p.insights.finance.planned_physical,
      end_date: p.end_date,
      delayed_task_count: p.delayed_task_count,
      ministry: p.ministry,
      sector: p.sector,
      state: p.state,
      health: p.insights.health,
      finance: p.insights.finance,
    })),
  });
});

app.get("/api/projects", authRequired, (req, res) => {
  const projects = loadVisible(req.user).filter((p) => matchesFilters(p, req.query));
  res.json(
    projects.map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      description: p.description,
      start_date: p.start_date,
      end_date: p.end_date,
      status: p.status,
      computed_status: p.computed_status,
      progress: p.progress,
      manager: p.manager,
      delayed_task_count: p.delayed_task_count,
      member_count: p.members.length,
      task_count: p.tasks.length,
      ministry: p.ministry,
      sector: p.sector,
      state: p.state,
      original_cost: p.original_cost,
      revised_cost: p.revised_cost,
      health: p.insights.health,
      finance: p.insights.finance,
    }))
  );
});

app.post("/api/projects", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const fields = projectWriteFields(req.body);
  if (!fields.name || !fields.start_date || !fields.end_date) {
    return res.status(400).json({ error: "Name, start date, and end date are required." });
  }
  if (!isISODate(fields.start_date) || !isISODate(fields.end_date)) {
    return res.status(400).json({ error: "Dates must use YYYY-MM-DD." });
  }
  if (fields.end_date < fields.start_date) {
    return res.status(400).json({ error: "End date must be on or after the start date." });
  }
  let managerId = req.user.id;
  if (req.user.role === "admin" && req.body?.manager_id) {
    managerId = Number(req.body.manager_id);
  }
  const info = db
    .prepare(
      `INSERT INTO projects (name, description, start_date, end_date, status, manager_id, code, ministry, sector, state,
        original_cost, revised_cost, expenditure, original_end_date, revised_end_date, delay_reason, delay_notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      fields.name,
      fields.description,
      fields.start_date,
      fields.end_date,
      fields.status,
      managerId,
      fields.code,
      fields.ministry,
      fields.sector,
      fields.state,
      fields.original_cost,
      fields.revised_cost,
      fields.expenditure,
      fields.original_end_date,
      fields.revised_end_date,
      fields.delay_reason,
      fields.delay_notes
    );
  db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)").run(
    info.lastInsertRowid,
    managerId
  );
  logAudit(req.user, { action: "created project", entity: "project", entityId: info.lastInsertRowid, projectId: info.lastInsertRowid, detail: fields.name });
  const project = enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(info.lastInsertRowid));
  res.status(201).json({ ...project, insights: intel(project) });
});

app.get("/api/projects/:id", authRequired, (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canAccessProject(req.user, id)) return res.status(403).json({ error: "No access to this project." });
  const project = enrichProject(row);
  res.json({ ...project, insights: intel(project), audit: listAudit({ projectId: id, limit: 40 }) });
});

app.put("/api/projects/:id", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) return res.status(403).json({ error: "Only the manager or an admin can edit this project." });
  const fields = projectWriteFields(req.body, row);
  if (!isISODate(fields.start_date) || !isISODate(fields.end_date)) {
    return res.status(400).json({ error: "Dates must use YYYY-MM-DD." });
  }
  db.prepare(
    `UPDATE projects SET name=?, description=?, start_date=?, end_date=?, status=?, code=?, ministry=?, sector=?, state=?,
     original_cost=?, revised_cost=?, expenditure=?, original_end_date=?, revised_end_date=?, delay_reason=?, delay_notes=?
     WHERE id=?`
  ).run(
    fields.name,
    fields.description,
    fields.start_date,
    fields.end_date,
    fields.status,
    fields.code,
    fields.ministry,
    fields.sector,
    fields.state,
    fields.original_cost,
    fields.revised_cost,
    fields.expenditure,
    fields.original_end_date,
    fields.revised_end_date,
    fields.delay_reason,
    fields.delay_notes,
    id
  );
  logAudit(req.user, {
    action: "updated project",
    entity: "project",
    entityId: id,
    projectId: id,
    detail: `${row.status} → ${fields.status}; revised cost ₹${fields.revised_cost} Cr`,
  });
  const project = enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
  res.json({ ...project, insights: intel(project) });
});

app.delete("/api/projects/:id", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) {
    return res.status(403).json({ error: "Only the manager or an admin can delete this project." });
  }
  db.prepare("DELETE FROM interventions WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM issues WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM tasks WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM milestones WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM project_members WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
  logAudit(req.user, { action: "deleted project", entity: "project", entityId: id, projectId: id, detail: row.name });
  res.json({ ok: true });
});

app.post("/api/projects/:id/members", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) return res.status(403).json({ error: "Cannot change team for this project." });
  const userId = Number(req.body?.user_id);
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) return res.status(400).json({ error: "User not found." });
  db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)").run(id, userId);
  res.json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

app.delete("/api/projects/:id/members/:userId", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) return res.status(403).json({ error: "Cannot change team for this project." });
  const userId = parseId(req.params.userId);
  if (userId === row.manager_id) {
    return res.status(400).json({ error: "The project manager cannot be removed from the team." });
  }
  db.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?").run(id, userId);
  res.json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

app.post("/api/projects/:id/milestones", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) return res.status(403).json({ error: "Cannot add milestones." });
  const title = String(req.body?.title || "").trim();
  const due_date = String(req.body?.due_date || "");
  const status = req.body?.status || "pending";
  if (!title || !due_date) return res.status(400).json({ error: "Title and due date are required." });
  if (!isISODate(due_date)) return res.status(400).json({ error: "Dates must use YYYY-MM-DD." });
  db.prepare("INSERT INTO milestones (project_id, title, due_date, status) VALUES (?, ?, ?, ?)").run(
    id,
    title,
    due_date,
    status
  );
  res.status(201).json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

app.put("/api/milestones/:id", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const milestone = db.prepare("SELECT * FROM milestones WHERE id = ?").get(id);
  if (!milestone) return res.status(404).json({ error: "Milestone not found." });
  if (!canManageProject(req.user, milestone.project_id)) {
    return res.status(403).json({ error: "Cannot update this milestone." });
  }
  db.prepare("UPDATE milestones SET title = ?, due_date = ?, status = ? WHERE id = ?").run(
    String(req.body?.title ?? milestone.title).trim(),
    String(req.body?.due_date ?? milestone.due_date),
    String(req.body?.status ?? milestone.status),
    id
  );
  res.json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(milestone.project_id)));
});

app.post("/api/projects/:id/tasks", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) return res.status(403).json({ error: "Cannot add tasks." });
  const title = String(req.body?.title || "").trim();
  const due_date = String(req.body?.due_date || "");
  if (!title || !due_date) return res.status(400).json({ error: "Title and due date are required." });
  if (!isISODate(due_date)) return res.status(400).json({ error: "Dates must use YYYY-MM-DD." });
  db.prepare(
    `INSERT INTO tasks (project_id, milestone_id, title, description, assignee_id, due_date, status, priority, progress)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    req.body?.milestone_id || null,
    title,
    String(req.body?.description || ""),
    req.body?.assignee_id || null,
    due_date,
    req.body?.status || "todo",
    req.body?.priority || "medium",
    Number(req.body?.progress ?? 0)
  );
  res.status(201).json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

app.put("/api/tasks/:id", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(id);
  if (!task) return res.status(404).json({ error: "Task not found." });
  if (!canManageProject(req.user, task.project_id)) {
    return res.status(403).json({ error: "Members have read-only access and cannot change tasks or status." });
  }

  const next = { ...task };
  next.title = String(req.body?.title ?? task.title).trim();
  next.description = String(req.body?.description ?? task.description);
  next.milestone_id = req.body?.milestone_id === undefined ? task.milestone_id : req.body.milestone_id;
  next.assignee_id = req.body?.assignee_id === undefined ? task.assignee_id : req.body.assignee_id;
  next.due_date = String(req.body?.due_date ?? task.due_date);
  next.priority = String(req.body?.priority ?? task.priority);
  next.status = String(req.body?.status ?? task.status);
  next.progress = Number(req.body?.progress ?? task.progress);
  if (next.status === "done") next.progress = 100;
  if (next.status === "todo" && next.progress === 100) next.progress = 0;

  db.prepare(
    `UPDATE tasks SET title = ?, description = ?, milestone_id = ?, assignee_id = ?, due_date = ?,
     status = ?, priority = ?, progress = ? WHERE id = ?`
  ).run(
    next.title,
    next.description,
    next.milestone_id || null,
    next.assignee_id || null,
    next.due_date,
    next.status,
    next.priority,
    next.progress,
    id
  );
  res.json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(task.project_id)));
});

app.get("/api/reports", authRequired, (req, res) => {
  const ids = visibleProjectIds(req.user);
  const projects = ids.map((id) => enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
  const delayed = [];
  const byStatus = { planning: 0, active: 0, delayed: 0, completed: 0, on_hold: 0 };
  const completion = { done: 0, open: 0 };

  const summaries = projects.map((p) => {
    byStatus[p.computed_status] = (byStatus[p.computed_status] || 0) + 1;
    for (const t of p.tasks) {
      if (t.status === "done") completion.done += 1;
      else completion.open += 1;
      if (isOverdue(t.due_date, t.status === "done")) {
        delayed.push({
          project: p.name,
          project_id: p.id,
          task: t.title,
          due_date: t.due_date,
          priority: t.priority,
          assignee: t.assignee_name,
        });
      }
    }
    return {
      id: p.id,
      name: p.name,
      manager: p.manager?.name,
      progress: p.progress,
      computed_status: p.computed_status,
      start_date: p.start_date,
      end_date: p.end_date,
      delayed_task_count: p.delayed_task_count,
      milestone_done: p.milestones.filter((m) => m.status === "completed").length,
      milestone_total: p.milestones.length,
      insights: intel(p),
    };
  });

  const reasonCounts = {};
  for (const p of projects) {
    if (p.delay_reason) reasonCounts[p.delay_reason] = (reasonCounts[p.delay_reason] || 0) + 1;
  }

  res.json({
    generated_at: new Date().toISOString(),
    by_status: byStatus,
    completion,
    overall_progress: projects.length
      ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
      : 0,
    delayed_activities: delayed,
    delay_reasons: Object.entries(reasonCounts).map(([id, count]) => ({
      id,
      label: delayLabel(id),
      count,
    })),
    projects: summaries,
  });
});

app.get("/api/meta", authRequired, (_req, res) => {
  res.json({ delay_reasons: DELAY_REASONS, ministries: MINISTRIES, sectors: SECTORS, states: STATES });
});

app.get("/api/briefing", authRequired, (req, res) => {
  const projects = loadVisible(req.user);
  const now = new Date();
  const period = now.toLocaleString("en-IN", { month: "long", year: "numeric" });
  const health = { on_track: 0, watch: 0, at_risk: 0, critical: 0 };
  const reasonCounts = {};
  let costOverruns = 0;
  let scheduleOverruns = 0;
  for (const p of projects) {
    health[p.insights.health.band] = (health[p.insights.health.band] || 0) + 1;
    if (p.delay_reason) reasonCounts[p.delay_reason] = (reasonCounts[p.delay_reason] || 0) + 1;
    if (p.insights.finance.cost_overrun_pct >= 5) costOverruns += 1;
    if (p.insights.finance.time_overrun_days >= 1) scheduleOverruns += 1;
  }
  const attention = health.at_risk + health.critical + health.watch;
  const topReasons = Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ label: delayLabel(id), count }));
  const interventions = db
    .prepare("SELECT * FROM interventions WHERE status != 'resolved' ORDER BY due_date LIMIT 8")
    .all();
  res.json({
    period,
    total_projects: projects.length,
    requiring_attention: attention,
    critical_projects: health.critical,
    health,
    major_delay_reasons: topReasons,
    cost_overruns: costOverruns,
    schedule_overruns: scheduleOverruns,
    top_interventions: interventions,
    narrative: [
      `MONTHLY PROJECT MONITORING BRIEF`,
      `Period: ${period}`,
      ``,
      `Total projects: ${projects.length}`,
      `Projects requiring attention: ${attention}`,
      `Critical projects: ${health.critical}`,
      ``,
      `Major reasons for delay:`,
      ...topReasons.slice(0, 5).map((r, i) => `${i + 1}. ${r.label} (${r.count})`),
      ``,
      `Projects with cost overruns: ${costOverruns}`,
      `Projects with schedule overruns: ${scheduleOverruns}`,
    ].join("\n"),
  });
});

app.get("/api/export/projects.csv", authRequired, (req, res) => {
  const projects = loadVisible(req.user);
  const headers = [
    "code",
    "name",
    "ministry",
    "sector",
    "state",
    "original_cost",
    "revised_cost",
    "expenditure",
    "start_date",
    "original_end_date",
    "revised_end_date",
    "physical_progress",
    "health_score",
    "health_band",
    "delay_reason",
    "status",
  ];
  const rows = projects.map((p) => ({
    code: p.code,
    name: p.name,
    ministry: p.ministry,
    sector: p.sector,
    state: p.state,
    original_cost: p.original_cost,
    revised_cost: p.revised_cost,
    expenditure: p.expenditure,
    start_date: p.start_date,
    original_end_date: p.original_end_date,
    revised_end_date: p.revised_end_date,
    physical_progress: p.progress,
    health_score: p.insights.health.score,
    health_band: p.insights.health.band,
    delay_reason: p.delay_reason,
    status: p.status,
  }));
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=projects.csv");
  res.send(toCsv(rows, headers));
});

app.post("/api/import/projects", authRequired, requireRole("admin"), (req, res) => {
  const csv = String(req.body?.csv || "");
  const { rows } = parseCsv(csv);
  const preview = [];
  let valid = 0;
  let flagged = 0;
  for (const row of rows) {
    const name = row.name || row["Project Name"] || row.project_name;
    const start = row.start_date || row["Start Date"];
    const end = row.end_date || row["Original End Date"] || row.original_end_date;
    const ok = Boolean(name && start && end && isISODate(start) && isISODate(end));
    if (ok) valid += 1;
    else flagged += 1;
    preview.push({ name: name || "(missing)", ok, row });
  }
  if (!req.body?.commit) {
    return res.json({ detected: rows.length, valid, flagged, preview: preview.slice(0, 50) });
  }
  let imported = 0;
  for (const item of preview.filter((p) => p.ok)) {
    const r = item.row;
    const start = r.start_date || r["Start Date"];
    const end = r.end_date || r["Original End Date"] || r.original_end_date;
    const fields = projectWriteFields({
      name: r.name || r["Project Name"],
      code: r.code || r["Project Code"],
      ministry: r.ministry || r.Ministry,
      sector: r.sector || r.Sector,
      state: r.state || r["State"] || r["State / UT"],
      original_cost: r.original_cost || r["Original Cost"],
      revised_cost: r.revised_cost || r["Revised Cost"],
      expenditure: r.expenditure || r.Expenditure,
      start_date: start,
      end_date: end,
      original_end_date: r.original_end_date || end,
      revised_end_date: r.revised_end_date || r["Revised End Date"] || end,
      status: "active",
    });
    const info = db
      .prepare(
        `INSERT INTO projects (name, description, start_date, end_date, status, manager_id, code, ministry, sector, state,
          original_cost, revised_cost, expenditure, original_end_date, revised_end_date, delay_reason, delay_notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        fields.name,
        "",
        fields.start_date,
        fields.end_date,
        "active",
        req.user.id,
        fields.code,
        fields.ministry,
        fields.sector,
        fields.state,
        fields.original_cost,
        fields.revised_cost,
        fields.expenditure,
        fields.original_end_date,
        fields.revised_end_date,
        "",
        ""
      );
    db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)").run(info.lastInsertRowid, req.user.id);
    imported += 1;
  }
  logAudit(req.user, { action: "imported projects", entity: "project", detail: `${imported} rows` });
  res.json({ imported, flagged });
});

app.post("/api/projects/:id/issues", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) return res.status(403).json({ error: "Cannot add issues." });
  const title = String(req.body?.title || "").trim();
  if (!title) return res.status(400).json({ error: "Issue title is required." });
  const info = db
    .prepare(
      `INSERT INTO issues (project_id, title, category, severity, owner, intervention, due_date, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      title,
      req.body?.category || "other",
      req.body?.severity || "medium",
      String(req.body?.owner || ""),
      String(req.body?.intervention || ""),
      req.body?.due_date || null,
      req.body?.status || "open",
      new Date().toISOString()
    );
  logAudit(req.user, { action: "opened issue", entity: "issue", entityId: info.lastInsertRowid, projectId: id, detail: title });
  res.status(201).json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

app.put("/api/issues/:id", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const issue = db.prepare("SELECT * FROM issues WHERE id = ?").get(id);
  if (!issue) return res.status(404).json({ error: "Issue not found." });
  if (!canManageProject(req.user, issue.project_id)) return res.status(403).json({ error: "Cannot update this issue." });
  db.prepare("UPDATE issues SET title=?, category=?, severity=?, owner=?, intervention=?, due_date=?, status=? WHERE id=?").run(
    String(req.body?.title ?? issue.title),
    String(req.body?.category ?? issue.category),
    String(req.body?.severity ?? issue.severity),
    String(req.body?.owner ?? issue.owner),
    String(req.body?.intervention ?? issue.intervention),
    req.body?.due_date ?? issue.due_date,
    String(req.body?.status ?? issue.status),
    id
  );
  logAudit(req.user, {
    action: "updated issue",
    entity: "issue",
    entityId: id,
    projectId: issue.project_id,
    detail: `${issue.status} → ${req.body?.status ?? issue.status}`,
  });
  res.json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(issue.project_id)));
});

app.post("/api/projects/:id/interventions", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) return res.status(403).json({ error: "Cannot create interventions." });
  const action = String(req.body?.action || "").trim();
  if (!action) return res.status(400).json({ error: "Action required." });
  const info = db
    .prepare(
      `INSERT INTO interventions (project_id, issue_id, action, authority, assigned_officer, due_date, priority, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      req.body?.issue_id || null,
      action,
      String(req.body?.authority || ""),
      String(req.body?.assigned_officer || ""),
      req.body?.due_date || null,
      req.body?.priority || "high",
      "open",
      new Date().toISOString()
    );
  logAudit(req.user, { action: "created intervention", entity: "intervention", entityId: info.lastInsertRowid, projectId: id, detail: action });
  res.status(201).json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

app.put("/api/interventions/:id", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const iv = db.prepare("SELECT * FROM interventions WHERE id = ?").get(id);
  if (!iv) return res.status(404).json({ error: "Intervention not found." });
  if (!canManageProject(req.user, iv.project_id)) return res.status(403).json({ error: "Cannot update this intervention." });
  db.prepare("UPDATE interventions SET action=?, authority=?, assigned_officer=?, due_date=?, priority=?, status=? WHERE id=?").run(
    String(req.body?.action ?? iv.action),
    String(req.body?.authority ?? iv.authority),
    String(req.body?.assigned_officer ?? iv.assigned_officer),
    req.body?.due_date ?? iv.due_date,
    String(req.body?.priority ?? iv.priority),
    String(req.body?.status ?? iv.status),
    id
  );
  logAudit(req.user, {
    action: "updated intervention",
    entity: "intervention",
    entityId: id,
    projectId: iv.project_id,
    detail: `${iv.status} → ${req.body?.status ?? iv.status}`,
  });
  res.json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(iv.project_id)));
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`SIH26103 API on http://localhost:${port}`);
});
