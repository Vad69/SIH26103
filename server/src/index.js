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

seedIfEmpty();

const app = express();
app.use(cors());
app.use(express.json());

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
  const ids = visibleProjectIds(req.user);
  const projects = ids
    .map((id) => enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)))
    .filter(Boolean);

  const buckets = { total: projects.length, active: 0, completed: 0, delayed: 0, planning: 0, on_hold: 0 };
  let progressSum = 0;
  const upcoming = [];
  const delayedTasks = [];

  for (const p of projects) {
    const status = p.computed_status;
    if (status === "delayed") buckets.delayed += 1;
    else if (buckets[status] !== undefined) buckets[status] += 1;
    progressSum += p.progress;
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

  const headlines = projects
    .map((p) => ({
      project_id: p.id,
      project_name: p.name,
      ...analyzeProject({ project: p, tasks: p.tasks, milestones: p.milestones }),
    }))
    .filter((h) => h.headline.severity === "high" || h.headline.severity === "medium");

  res.json({
    stats: {
      ...buckets,
      overall_progress: projects.length ? Math.round(progressSum / projects.length) : 0,
    },
    upcoming_deadlines: upcoming.slice(0, 8),
    delayed_tasks: delayedTasks.slice(0, 8),
    risk_alerts: headlines.slice(0, 6),
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      computed_status: p.computed_status,
      progress: p.progress,
      end_date: p.end_date,
      delayed_task_count: p.delayed_task_count,
    })),
  });
});

app.get("/api/projects", authRequired, (req, res) => {
  const ids = visibleProjectIds(req.user);
  const projects = ids.map((id) => {
    const p = enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id));
    return {
      id: p.id,
      name: p.name,
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
    };
  });
  res.json(projects);
});

app.post("/api/projects", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const name = String(req.body?.name || "").trim();
  const description = String(req.body?.description || "").trim();
  const start_date = String(req.body?.start_date || "");
  const end_date = String(req.body?.end_date || "");
  const status = req.body?.status || "planning";
  if (!name || !start_date || !end_date) {
    return res.status(400).json({ error: "Name, start date, and end date are required." });
  }
  if (!isISODate(start_date) || !isISODate(end_date)) {
    return res.status(400).json({ error: "Dates must use YYYY-MM-DD." });
  }
  if (end_date < start_date) {
    return res.status(400).json({ error: "End date must be on or after the start date." });
  }
  let managerId = req.user.id;
  if (req.user.role === "admin" && req.body?.manager_id) {
    managerId = Number(req.body.manager_id);
  }
  const info = db
    .prepare(
      `INSERT INTO projects (name, description, start_date, end_date, status, manager_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(name, description, start_date, end_date, status, managerId);
  db.prepare("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?, ?)").run(
    info.lastInsertRowid,
    managerId
  );
  const project = enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(info.lastInsertRowid));
  res.status(201).json(project);
});

app.get("/api/projects/:id", authRequired, (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canAccessProject(req.user, id)) return res.status(403).json({ error: "No access to this project." });
  const project = enrichProject(row);
  const insights = analyzeProject({
    project,
    tasks: project.tasks,
    milestones: project.milestones,
  });
  res.json({ ...project, insights });
});

app.put("/api/projects/:id", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) return res.status(403).json({ error: "Only the manager or an admin can edit this project." });
  const name = String(req.body?.name ?? row.name).trim();
  const description = String(req.body?.description ?? row.description);
  const start_date = String(req.body?.start_date ?? row.start_date);
  const end_date = String(req.body?.end_date ?? row.end_date);
  const status = String(req.body?.status ?? row.status);
  if (!isISODate(start_date) || !isISODate(end_date)) {
    return res.status(400).json({ error: "Dates must use YYYY-MM-DD." });
  }
  db.prepare(
    `UPDATE projects SET name = ?, description = ?, start_date = ?, end_date = ?, status = ? WHERE id = ?`
  ).run(name, description, start_date, end_date, status, id);
  res.json(enrichProject(db.prepare("SELECT * FROM projects WHERE id = ?").get(id)));
});

app.delete("/api/projects/:id", authRequired, requireRole("admin", "project_manager"), (req, res) => {
  const id = parseId(req.params.id);
  const row = projectOr404(id, res);
  if (!row) return;
  if (!canManageProject(req.user, id)) {
    return res.status(403).json({ error: "Only the manager or an admin can delete this project." });
  }
  db.prepare("DELETE FROM tasks WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM milestones WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM project_members WHERE project_id = ?").run(id);
  db.prepare("DELETE FROM projects WHERE id = ?").run(id);
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
      insights: analyzeProject({ project: p, tasks: p.tasks, milestones: p.milestones }),
    };
  });

  res.json({
    generated_at: new Date().toISOString(),
    by_status: byStatus,
    completion,
    overall_progress: projects.length
      ? Math.round(projects.reduce((s, p) => s + p.progress, 0) / projects.length)
      : 0,
    delayed_activities: delayed,
    projects: summaries,
  });
});

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`SIH26103 API on http://localhost:${port}`);
});
