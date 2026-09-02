import db from "./db.js";

export function logAudit(user, { action, entity, entityId = null, projectId = null, detail = "" }) {
  db.prepare(
    `INSERT INTO audit_log (user_id, actor_name, action, entity, entity_id, project_id, detail, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    user?.id || null,
    user?.name || "System",
    action,
    entity,
    entityId,
    projectId,
    detail,
    new Date().toISOString()
  );
}

export function listAudit({ projectId, limit = 80 } = {}) {
  if (projectId) {
    return db
      .prepare("SELECT * FROM audit_log WHERE project_id = ? ORDER BY id DESC LIMIT ?")
      .all(projectId, limit);
  }
  return db.prepare("SELECT * FROM audit_log ORDER BY id DESC LIMIT ?").all(limit);
}
