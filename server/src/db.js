import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.MONITOR_DB || path.join(dataDir, "monitor.db");
const raw = new DatabaseSync(dbPath);
raw.exec("PRAGMA journal_mode = WAL");
raw.exec("PRAGMA foreign_keys = ON");

function asPlain(row) {
  return row ? { ...row } : undefined;
}

const db = {
  exec(sql) {
    return raw.exec(sql);
  },
  prepare(sql) {
    const stmt = raw.prepare(sql);
    return {
      run(...args) {
        const info = stmt.run(...args);
        return {
          lastInsertRowid: Number(info.lastInsertRowid),
          changes: Number(info.changes),
        };
      },
      get(...args) {
        return asPlain(stmt.get(...args));
      },
      all(...args) {
        return stmt.all(...args).map(asPlain);
      },
    };
  },
};

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'project_manager', 'team_member'))
);

CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('planning', 'active', 'completed', 'on_hold')),
  manager_id INTEGER NOT NULL REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  milestone_id INTEGER REFERENCES milestones(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'in_progress', 'done')),
  priority TEXT NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100)
);
`);

function columnNames(table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

function addColumn(table, name, definition) {
  if (!columnNames(table).includes(name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

addColumn("projects", "code", "TEXT DEFAULT ''");
addColumn("projects", "ministry", "TEXT DEFAULT ''");
addColumn("projects", "sector", "TEXT DEFAULT ''");
addColumn("projects", "state", "TEXT DEFAULT ''");
addColumn("projects", "original_cost", "REAL DEFAULT 0");
addColumn("projects", "revised_cost", "REAL DEFAULT 0");
addColumn("projects", "expenditure", "REAL DEFAULT 0");
addColumn("projects", "original_end_date", "TEXT");
addColumn("projects", "revised_end_date", "TEXT");
addColumn("projects", "delay_reason", "TEXT DEFAULT ''");
addColumn("projects", "delay_notes", "TEXT DEFAULT ''");
addColumn("projects", "data_source", "TEXT DEFAULT 'manual'");
addColumn("projects", "reported_physical_progress", "REAL");
addColumn("projects", "health_band", "TEXT DEFAULT ''");
addColumn("projects", "health_score", "INTEGER");
addColumn("projects", "previous_health_band", "TEXT DEFAULT ''");

db.exec(`
UPDATE projects SET original_end_date = end_date WHERE original_end_date IS NULL OR original_end_date = '';
UPDATE projects SET revised_end_date = end_date WHERE revised_end_date IS NULL OR revised_end_date = '';

CREATE TABLE IF NOT EXISTS issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  owner TEXT DEFAULT '',
  intervention TEXT DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS interventions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  authority TEXT DEFAULT '',
  assigned_officer TEXT DEFAULT '',
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'high' CHECK (priority IN ('medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id INTEGER,
  project_id INTEGER,
  detail TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
`);

addColumn("audit_log", "project_id", "INTEGER");
addColumn("audit_log", "prev_value", "TEXT DEFAULT ''");
addColumn("audit_log", "new_value", "TEXT DEFAULT ''");

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function isOverdue(dueDate, statusDone) {
  return !statusDone && dueDate < todayISO();
}

export function publicUser(row) {
  if (!row) return null;
  return { id: row.id, name: row.name, email: row.email, role: row.role };
}

export function taskProgress(tasks) {
  if (!tasks.length) return 0;
  return Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / tasks.length);
}

export function projectStatusFromDates(project, progress) {
  if (project.status === "completed" || project.status === "on_hold" || project.status === "planning") {
    return project.status;
  }
  if (progress >= 100) return "completed";
  if (project.end_date < todayISO() && progress < 100) return "delayed";
  return "active";
}

export function enrichProject(project) {
  const tasks = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.project_id = ? ORDER BY t.due_date`
    )
    .all(project.id);
  const milestones = db
    .prepare("SELECT * FROM milestones WHERE project_id = ? ORDER BY due_date")
    .all(project.id);
  const members = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role
       FROM project_members pm JOIN users u ON u.id = pm.user_id
       WHERE pm.project_id = ? ORDER BY u.name`
    )
    .all(project.id);
  const manager = publicUser(db.prepare("SELECT * FROM users WHERE id = ?").get(project.manager_id));
  const issues = db.prepare("SELECT * FROM issues WHERE project_id = ? ORDER BY created_at DESC").all(project.id);
  const interventions = db
    .prepare("SELECT * FROM interventions WHERE project_id = ? ORDER BY created_at DESC")
    .all(project.id);
  const progress = taskProgress(tasks);
  const delayedTasks = tasks.filter((t) => isOverdue(t.due_date, t.status === "done"));
  const computedStatus = projectStatusFromDates(project, progress);

  return {
    ...project,
    manager,
    members,
    milestones,
    tasks,
    issues,
    interventions,
    progress,
    delayed_task_count: delayedTasks.length,
    computed_status: computedStatus,
  };
}

export function canAccessProject(user, projectId) {
  if (user.role === "admin") return true;
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) return false;
  if (project.manager_id === user.id) return true;
  const member = db
    .prepare("SELECT 1 FROM project_members WHERE project_id = ? AND user_id = ?")
    .get(projectId, user.id);
  return Boolean(member);
}

export function canManageProject(user, projectId) {
  if (user.role === "admin") return true;
  const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId);
  if (!project) return false;
  return user.role === "project_manager" && project.manager_id === user.id;
}

export function visibleProjectIds(user) {
  if (user.role === "admin") {
    return db.prepare("SELECT id FROM projects").all().map((r) => r.id);
  }
  return db
    .prepare(
      `SELECT id FROM projects WHERE manager_id = ?
       UNION
       SELECT project_id AS id FROM project_members WHERE user_id = ?`
    )
    .all(user.id, user.id)
    .map((r) => r.id);
}

export default db;
