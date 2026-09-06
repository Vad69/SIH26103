import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import {
  commencementDelayDays,
  currentStage,
  ensureLifecycle,
  lifecycleLabel,
  listLifecycle,
  listResources,
} from "./lifecycle.js";

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
addColumn("projects", "funds_released", "REAL DEFAULT 0");

const PROJECT_LIFECYCLE_COLS = [
  ["tender_status", "TEXT DEFAULT 'not_started'"],
  ["tender_document_date", "TEXT"],
  ["tender_publication_date", "TEXT"],
  ["bid_deadline", "TEXT"],
  ["evaluation_date", "TEXT"],
  ["tender_award_date", "TEXT"],
  ["contracting_agency", "TEXT DEFAULT ''"],
  ["tender_contract_value", "REAL DEFAULT 0"],
  ["tender_remarks", "TEXT DEFAULT ''"],
  ["tender_delay_reason", "TEXT DEFAULT ''"],
  ["award_date", "TEXT"],
  ["awarded_agency", "TEXT DEFAULT ''"],
  ["award_contract_value", "REAL DEFAULT 0"],
  ["award_planned_commencement", "TEXT"],
  ["award_remarks", "TEXT DEFAULT ''"],
  ["work_order_issued", "INTEGER DEFAULT 0"],
  ["work_order_number", "TEXT DEFAULT ''"],
  ["work_order_date", "TEXT"],
  ["contract_reference", "TEXT DEFAULT ''"],
  ["executing_agency", "TEXT DEFAULT ''"],
  ["wo_planned_commencement", "TEXT"],
  ["wo_actual_commencement", "TEXT"],
  ["work_order_remarks", "TEXT DEFAULT ''"],
  ["planned_commencement_date", "TEXT"],
  ["actual_commencement_date", "TEXT"],
  ["commencement_status", "TEXT DEFAULT 'not_started'"],
  ["commencement_delay_reason", "TEXT DEFAULT ''"],
  ["commencement_remarks", "TEXT DEFAULT ''"],
  ["testing_status", "TEXT DEFAULT 'not_started'"],
  ["testing_planned", "TEXT"],
  ["testing_actual", "TEXT"],
  ["testing_remarks", "TEXT DEFAULT ''"],
  ["testing_issues", "TEXT DEFAULT ''"],
  ["commissioning_status", "TEXT DEFAULT 'not_started'"],
  ["commissioning_planned", "TEXT"],
  ["commissioning_actual", "TEXT"],
  ["commissioning_remarks", "TEXT DEFAULT ''"],
  ["commissioning_outstanding", "TEXT DEFAULT ''"],
  ["handover_status", "TEXT DEFAULT 'not_started'"],
  ["handover_planned", "TEXT"],
  ["handover_actual", "TEXT"],
  ["receiving_agency", "TEXT DEFAULT ''"],
  ["handover_remarks", "TEXT DEFAULT ''"],
  ["handover_defects", "TEXT DEFAULT ''"],
  ["completion_certificate_status", "TEXT DEFAULT ''"],
  ["supervision_type", "TEXT DEFAULT ''"],
  ["supervising_org", "TEXT DEFAULT ''"],
  ["supervising_person", "TEXT DEFAULT ''"],
  ["supervision_start", "TEXT"],
  ["supervision_end", "TEXT"],
  ["supervision_remarks", "TEXT DEFAULT ''"],
];
for (const [name, def] of PROJECT_LIFECYCLE_COLS) {
  addColumn("projects", name, def);
}
addColumn("tasks", "wbs_group", "TEXT DEFAULT 'other'");

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
addColumn("issues", "suggested_category", "TEXT");
addColumn("issues", "nlp_confidence", "REAL");
addColumn("issues", "nlp_version", "TEXT");
addColumn("issues", "nlp_accepted_category", "TEXT");

db.exec(`
CREATE TABLE IF NOT EXISTS preconstructions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'statutory',
  status TEXT NOT NULL DEFAULT 'not_started',
  planned_completion TEXT,
  actual_completion TEXT,
  authority TEXT DEFAULT '',
  delay_reason TEXT DEFAULT '',
  remarks TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE TABLE IF NOT EXISTS quick_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reported_progress REAL,
  status TEXT,
  blocker TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  suggested_category TEXT,
  created_at TEXT NOT NULL,
  user_id INTEGER
);

CREATE TABLE IF NOT EXISTS lifecycle_stages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  stage_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started',
  planned_date TEXT,
  actual_date TEXT,
  delay_reason TEXT DEFAULT '',
  responsible TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  UNIQUE(project_id, stage_key)
);

CREATE TABLE IF NOT EXISTS resource_readiness (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_applicable',
  responsible TEXT DEFAULT '',
  expected_date TEXT,
  actual_date TEXT,
  delay_reason TEXT DEFAULT '',
  remarks TEXT DEFAULT '',
  UNIQUE(project_id, category)
);

CREATE TABLE IF NOT EXISTS project_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'auto',
  state_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_project_reviews_project ON project_reviews(project_id, created_at, id);
`);

(function migrateInterventions() {
  const master = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='interventions'").get();
  const sql = master?.sql || "";
  if (sql.includes("'cancelled'")) {
    addColumn("interventions", "recommended_action", "TEXT DEFAULT ''");
    addColumn("interventions", "actual_action", "TEXT DEFAULT ''");
    addColumn("interventions", "trigger_summary", "TEXT DEFAULT ''");
    addColumn("interventions", "outcome", "TEXT DEFAULT ''");
    addColumn("interventions", "completed_at", "TEXT");
    return;
  }
  raw.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    CREATE TABLE interventions_mig (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      recommended_action TEXT DEFAULT '',
      actual_action TEXT DEFAULT '',
      trigger_summary TEXT DEFAULT '',
      outcome TEXT DEFAULT '',
      authority TEXT DEFAULT '',
      assigned_officer TEXT DEFAULT '',
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'high' CHECK (priority IN ('medium', 'high', 'critical')),
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'cancelled')),
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    INSERT INTO interventions_mig (id, project_id, issue_id, action, authority, assigned_officer, due_date, priority, status, created_at)
    SELECT id, project_id, issue_id, action, authority, assigned_officer, due_date, priority, status, created_at FROM interventions;
    DROP TABLE interventions;
    ALTER TABLE interventions_mig RENAME TO interventions;
  `);
  raw.exec("PRAGMA foreign_keys = ON");
})();

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

export function enrichProject(project, { ensure = true } = {}) {
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
  const preconstructions = db
    .prepare("SELECT * FROM preconstructions WHERE project_id = ? ORDER BY planned_completion")
    .all(project.id);
  const lifecycle_stages = listLifecycle(db, project.id, { ensure });
  const resources = listResources(db, project.id, { ensure });
  const progress = taskProgress(tasks);
  const delayedTasks = tasks.filter((t) => isOverdue(t.due_date, t.status === "done"));
  const computedStatus = projectStatusFromDates(project, progress);
  const commenceDelay = commencementDelayDays(project.planned_commencement_date, project.actual_commencement_date);
  const current = currentStage(lifecycle_stages);

  return {
    ...project,
    manager,
    members,
    milestones,
    tasks,
    issues,
    interventions,
    preconstructions,
    lifecycle_stages,
    resources,
    current_stage: current?.stage_key || "",
    current_stage_label: current ? lifecycleLabel(current.stage_key) : "",
    commencement_delay_days: commenceDelay,
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
