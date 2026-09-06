/**
 * Project lifecycle helpers — monitoring metadata, not a procurement/ERP engine.
 */
export const LIFECYCLE_STAGES = [
  { key: "pre_construction", label: "Pre-Construction", order: 1 },
  { key: "tender", label: "Tender", order: 2 },
  { key: "award", label: "Award / Tender Acceptance", order: 3 },
  { key: "work_order", label: "Work Order", order: 4 },
  { key: "commencement", label: "Commencement", order: 5 },
  { key: "resource_mobilisation", label: "Resource Mobilisation", order: 6 },
  { key: "execution", label: "Execution", order: 7 },
  { key: "testing", label: "Testing", order: 8 },
  { key: "commissioning", label: "Commissioning", order: 9 },
  { key: "completion", label: "Completion", order: 10 },
  { key: "handover", label: "Handover", order: 11 },
];

export const LIFECYCLE_STATUSES = [
  { id: "not_started", label: "Not Started" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "delayed", label: "Delayed" },
  { id: "blocked", label: "Blocked" },
  { id: "not_applicable", label: "Not Applicable" },
];

export const TENDER_STATUSES = [
  { id: "not_started", label: "Not Started" },
  { id: "document_preparation", label: "Document Preparation" },
  { id: "published", label: "Published" },
  { id: "under_evaluation", label: "Under Evaluation" },
  { id: "awarded", label: "Awarded" },
  { id: "cancelled", label: "Cancelled" },
  { id: "delayed", label: "Delayed" },
];

export const RESOURCE_CATEGORIES = [
  { id: "human_resources", label: "Human Resources" },
  { id: "materials", label: "Materials" },
  { id: "equipment", label: "Equipment" },
  { id: "logistics", label: "Logistics" },
  { id: "site_readiness", label: "Site Readiness" },
];

export const RESOURCE_STATUSES = [
  { id: "ready", label: "Ready" },
  { id: "partial", label: "Partial" },
  { id: "delayed", label: "Delayed" },
  { id: "blocked", label: "Blocked" },
  { id: "not_applicable", label: "Not Applicable" },
];

export const WBS_GROUPS = [
  { id: "civil", label: "Civil Works" },
  { id: "electrical", label: "Electrical" },
  { id: "procurement", label: "Procurement" },
  { id: "installation", label: "Installation" },
  { id: "testing", label: "Testing" },
  { id: "other", label: "Other" },
];

export const SUPERVISION_TYPES = [
  { id: "departmental", label: "Departmental" },
  { id: "third_party_pmc", label: "Third-Party / PMC" },
  { id: "consultant", label: "Consultant" },
  { id: "other", label: "Other" },
];

const STAGE_STATUS_IDS = new Set(LIFECYCLE_STATUSES.map((s) => s.id));
const RESOURCE_STATUS_IDS = new Set(RESOURCE_STATUSES.map((s) => s.id));
const TENDER_STATUS_IDS = new Set(TENDER_STATUSES.map((s) => s.id));
const STAGE_KEYS = new Set(LIFECYCLE_STAGES.map((s) => s.key));
const RESOURCE_KEYS = new Set(RESOURCE_CATEGORIES.map((s) => s.id));

export function isISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function commencementDelayDays(planned, actual) {
  if (!planned || !actual) return null;
  if (!isISODate(planned) || !isISODate(actual)) return null;
  const ms = new Date(`${actual}T00:00:00Z`) - new Date(`${planned}T00:00:00Z`);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 86400000);
}

export function lifecycleLabel(key) {
  return LIFECYCLE_STAGES.find((s) => s.key === key)?.label || key || "";
}

export function ensureLifecycle(db, projectId) {
  const insertStage = db.prepare(
    `INSERT OR IGNORE INTO lifecycle_stages
      (project_id, stage_key, sort_order, status, planned_date, actual_date, delay_reason, responsible, remarks)
     VALUES (?, ?, ?, 'not_started', NULL, NULL, '', '', '')`
  );
  for (const s of LIFECYCLE_STAGES) {
    insertStage.run(projectId, s.key, s.order);
  }
  const insertRes = db.prepare(
    `INSERT OR IGNORE INTO resource_readiness
      (project_id, category, status, responsible, expected_date, actual_date, delay_reason, remarks)
     VALUES (?, ?, 'not_applicable', '', NULL, NULL, '', '')`
  );
  for (const c of RESOURCE_CATEGORIES) {
    insertRes.run(projectId, c.id);
  }
}

export function listLifecycle(db, projectId, { ensure = true } = {}) {
  if (ensure) ensureLifecycle(db, projectId);
  return db
    .prepare("SELECT * FROM lifecycle_stages WHERE project_id = ? ORDER BY sort_order")
    .all(projectId);
}

export function listResources(db, projectId, { ensure = true } = {}) {
  if (ensure) ensureLifecycle(db, projectId);
  return db.prepare("SELECT * FROM resource_readiness WHERE project_id = ?").all(projectId);
}

export function currentStage(stages = []) {
  const ordered = [...stages].sort((a, b) => a.sort_order - b.sort_order);
  const inProgress = [...ordered].reverse().find((s) => s.status === "in_progress");
  if (inProgress) return inProgress;
  const current = ordered.find((s) => s.status !== "completed" && s.status !== "not_applicable");
  return current || ordered[ordered.length - 1] || null;
}

export function stageTone(stage, currentKey) {
  if (!stage) return "upcoming";
  if (stage.status === "blocked") return "blocked";
  if (stage.status === "delayed") return "delayed";
  if (stage.status === "completed") return "completed";
  if (stage.status === "not_applicable") return "upcoming";
  if (stage.stage_key === currentKey) return "current";
  if (stage.status === "in_progress") return "current";
  return "upcoming";
}

export function delayedLifecycleStages(stages = []) {
  return stages.filter((s) => s.status === "delayed" || s.status === "blocked");
}

export function delayedStagesForPenalty(
  lifecycle_stages = [],
  { skipCommencement = false, skipPreconstruction = false, skipResourceMobilisation = false } = {}
) {
  return lifecycle_stages.filter((s) => {
    if (s.status !== "delayed" && s.status !== "blocked") return false;
    if (skipCommencement && s.stage_key === "commencement") return false;
    if (skipPreconstruction && s.stage_key === "pre_construction") return false;
    if (skipResourceMobilisation && s.stage_key === "resource_mobilisation") return false;
    return true;
  });
}

export function isLifecycleStatus(status) {
  return STAGE_STATUS_IDS.has(String(status || ""));
}

export function blockedResources(resources = []) {
  return resources.filter((r) => r.status === "delayed" || r.status === "blocked");
}

export function validateLifecyclePatch(body) {
  const status = String(body?.status || "");
  if (status && !STAGE_STATUS_IDS.has(status)) {
    return "Lifecycle status must be Not Started, In Progress, Completed, Delayed, Blocked, or Not Applicable.";
  }
  for (const key of ["planned_date", "actual_date"]) {
    const v = body?.[key];
    if (v && !isISODate(v)) return "Dates must use YYYY-MM-DD.";
  }
  return null;
}

export function validateResourcePatch(body) {
  const status = String(body?.status || "");
  if (status && !RESOURCE_STATUS_IDS.has(status)) {
    return "Resource status must be Ready, Partial, Delayed, Blocked, or Not Applicable.";
  }
  for (const key of ["expected_date", "actual_date"]) {
    const v = body?.[key];
    if (v && !isISODate(v)) return "Dates must use YYYY-MM-DD.";
  }
  return null;
}

export function validateTenderStatus(status) {
  if (!status) return null;
  if (!TENDER_STATUS_IDS.has(String(status))) {
    return "Tender status is not a recognised monitoring state.";
  }
  return null;
}

export function isStageKey(key) {
  return STAGE_KEYS.has(String(key));
}

export function isResourceCategory(key) {
  return RESOURCE_KEYS.has(String(key));
}

export function snapshotCounts(projects) {
  const counts = {};
  for (const s of LIFECYCLE_STAGES) counts[s.key] = 0;
  const stuck = [];
  for (const p of projects) {
    const cur = currentStage(p.lifecycle_stages || []);
    if (cur?.stage_key && counts[cur.stage_key] != null) counts[cur.stage_key] += 1;
    const delayed = delayedLifecycleStages(p.lifecycle_stages || []);
    if (delayed.length) {
      stuck.push({
        id: p.id,
        name: p.name,
        stage: delayed[0].stage_key,
        status: delayed[0].status,
      });
    }
  }
  return { by_stage: counts, stuck };
}
