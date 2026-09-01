import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, "monitor.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

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
  const progress = taskProgress(tasks);
  const delayedTasks = tasks.filter((t) => isOverdue(t.due_date, t.status === "done"));
  const computedStatus = projectStatusFromDates(project, progress);

  return {
    ...project,
    manager,
    members,
    milestones,
    tasks,
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
