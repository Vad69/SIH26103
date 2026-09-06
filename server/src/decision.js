/**
 * Decision-support layer: review snapshots, what-changed, what-if simulation,
 * interventions helpers, decision timeline, and executive board.
 *
 * Health and forecast remain sourced from insights.js and forecast.js.
 * This module does not retune five-factor weights.
 */

import { analyzeProject } from "./insights.js";
import { forecastProject } from "./forecast.js";
import { RESOURCE_CATEGORIES, RESOURCE_STATUSES } from "./lifecycle.js";

export const INTERVENTION_STATUSES = ["open", "in_progress", "resolved", "cancelled"];
export const INTERVENTION_PRIORITIES = ["medium", "high", "critical"];

const RESOURCE_IDS = new Set(RESOURCE_CATEGORIES.map((c) => c.id));
const RESOURCE_STATUS_IDS = new Set(RESOURCE_STATUSES.map((s) => s.id));

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function resourceLabel(cat) {
  return RESOURCE_CATEGORIES.find((c) => c.id === cat)?.label || String(cat || "").replaceAll("_", " ");
}

function resourceSeverity(status) {
  if (status === "blocked") return 4;
  if (status === "delayed") return 3;
  if (status === "partial") return 2;
  if (status === "ready") return 1;
  return 0;
}

function bandRank(band) {
  return { critical: 0, at_risk: 1, watch: 2, on_track: 3 }[band] ?? 1;
}

export function intelInput(project) {
  return {
    project,
    tasks: project.tasks || [],
    milestones: project.milestones || [],
    issues: project.issues || [],
    preconstructions: project.preconstructions || [],
    lifecycle_stages: project.lifecycle_stages || [],
    resources: project.resources || [],
  };
}

export function captureState(project, insights) {
  const health = insights?.health || {};
  const forecast = insights?.forecast || {};
  const outlook = insights?.outlook || {};
  const resources = {};
  for (const row of project.resources || []) {
    resources[row.category] = row.status;
  }
  const clearances = (project.preconstructions || [])
    .filter((p) => p.status === "delayed" || p.status === "blocked")
    .map((p) => p.name);
  const openMilestonesPastDue = (project.milestones || []).filter(
    (m) => m.status !== "completed" && m.due_date && String(m.due_date) < new Date().toISOString().slice(0, 10)
  ).length;
  return {
    captured_at: new Date().toISOString(),
    health_score: Number(health.score) || 0,
    health_band: health.band || "unknown",
    physical_progress: Number(insights?.progress ?? project.progress) || 0,
    financial_progress: Number(insights?.finance?.financial_progress ?? outlook.financial_progress) || 0,
    expenditure: Number(project.expenditure) || 0,
    forecast_slippage_days: Number(forecast.estimated_slippage_days) || 0,
    forecast_risk: forecast.schedule_risk || "unknown",
    forecast_finish: forecast.estimated_completion || null,
    overdue_critical: Number(insights?.overdue_critical_count) || 0,
    overdue_milestones: openMilestonesPastDue,
    resources,
    clearances,
    commencement_delay_days: insights?.commencement_delay_days ?? project.commencement_delay_days ?? null,
    current_stage: outlook.current_stage || project.current_stage || null,
    bottleneck: outlook.bottleneck?.label || null,
    top_reason: outlook.why?.[0] || health.reasons?.[0]?.text || null,
    recommended_action: outlook.recommended_action || health.intervention || null,
    open_alerts: (insights?.alerts || []).filter((a) => a.severity === "high" || a.severity === "medium").length,
    tender_status: project.tender_status || null,
  };
}

export function fingerprint(state) {
  if (!state) return "";
  return JSON.stringify({
    health_score: state.health_score,
    health_band: state.health_band,
    physical_progress: state.physical_progress,
    financial_progress: state.financial_progress,
    expenditure: state.expenditure,
    forecast_slippage_days: state.forecast_slippage_days,
    overdue_critical: state.overdue_critical,
    overdue_milestones: state.overdue_milestones,
    resources: state.resources,
    clearances: state.clearances,
    commencement_delay_days: state.commencement_delay_days,
    current_stage: state.current_stage,
  });
}

export function parseReviewState(row) {
  if (!row) return null;
  try {
    return typeof row.state_json === "string" ? JSON.parse(row.state_json) : row.state_json;
  } catch {
    return null;
  }
}

export function primaryDriver(changes) {
  if (!changes?.length) return null;
  const rank = (c) => {
    if (c.field === "resources" && (c.to === "blocked" || c.to_status === "blocked")) return 100;
    if (c.field === "overdue_milestones" && num(c.delta) > 0) return 90;
    if (c.field === "overdue_critical" && num(c.delta) > 0) return 88;
    if (c.field === "physical_progress" && num(c.delta) < 0) return 80;
    if (c.field === "health_score" && num(c.delta) < 0) return 70;
    if (c.field === "forecast_slippage_days" && num(c.delta) > 0) return 65;
    if (c.field === "clearances" && c.direction === "worse") return 60;
    if (c.field === "commencement_delay_days" && num(c.delta) > 0) return 55;
    if (c.field === "financial_progress" && num(c.delta) < 0) return 50;
    if (c.field === "resources" && c.direction === "worse") return 45;
    if (c.direction === "worse") return 20;
    if (c.direction === "better") return 10;
    return 0;
  };
  return [...changes].sort((a, b) => rank(b) - rank(a))[0] || null;
}

export function diffStates(previous, current) {
  const changes = [];
  if (!previous || !current) return { changes, primary_driver: null };

function evidenceFor(field) {
  if (field === "forecast_slippage_days" || field === "forecast_risk") return "forecast";
  if (field === "health_score" || field === "health_band") return "analysis";
  return "observed";
}

function evidenceLabel(kind) {
  if (kind === "forecast") return "Forecast";
  if (kind === "analysis") return "Rule-based health";
  return "Observed";
}

  const push = (field, from, to, extra = {}) => {
    if (from === to) return;
    const evidence = extra.evidence || evidenceFor(field);
    changes.push({ field, from, to, evidence, evidence_label: evidenceLabel(evidence), ...extra });
  };

  const hs = num(current.health_score) - num(previous.health_score);
  if (hs !== 0) {
    push("health_score", previous.health_score, current.health_score, {
      delta: hs,
      direction: hs < 0 ? "worse" : "better",
      label: "Project health",
    });
  }
  if (previous.health_band !== current.health_band) {
    push("health_band", previous.health_band, current.health_band, {
      direction: bandRank(current.health_band) < bandRank(previous.health_band) ? "worse" : "better",
      label: "Health category",
    });
  }
  const phys = round1(num(current.physical_progress) - num(previous.physical_progress));
  if (phys !== 0) {
    push("physical_progress", previous.physical_progress, current.physical_progress, {
      delta: phys,
      direction: phys < 0 ? "worse" : "better",
      label: "Physical progress",
    });
  }
  const fin = round1(num(current.financial_progress) - num(previous.financial_progress));
  if (fin !== 0) {
    push("financial_progress", previous.financial_progress, current.financial_progress, {
      delta: fin,
      direction: fin < 0 ? "worse" : "better",
      label: "Financial progress",
    });
  }
  const exp = round1(num(current.expenditure) - num(previous.expenditure));
  if (exp !== 0) {
    push("expenditure", previous.expenditure, current.expenditure, {
      delta: exp,
      direction: "info",
      label: "Expenditure",
    });
  }
  const slip = num(current.forecast_slippage_days) - num(previous.forecast_slippage_days);
  if (slip !== 0) {
    push("forecast_slippage_days", previous.forecast_slippage_days, current.forecast_slippage_days, {
      delta: slip,
      direction: slip > 0 ? "worse" : "better",
      label: "Forecasted delay",
    });
  }
  const crit = num(current.overdue_critical) - num(previous.overdue_critical);
  if (crit !== 0) {
    push("overdue_critical", previous.overdue_critical, current.overdue_critical, {
      delta: crit,
      direction: crit > 0 ? "worse" : "better",
      label: "Critical tasks overdue",
    });
  }
  const mil = num(current.overdue_milestones) - num(previous.overdue_milestones);
  if (mil !== 0) {
    push("overdue_milestones", previous.overdue_milestones, current.overdue_milestones, {
      delta: mil,
      direction: mil > 0 ? "worse" : "better",
      label: "Milestones overdue",
    });
  }
  const comm = num(current.commencement_delay_days) - num(previous.commencement_delay_days);
  if (comm !== 0) {
    push("commencement_delay_days", previous.commencement_delay_days, current.commencement_delay_days, {
      delta: comm,
      direction: comm > 0 ? "worse" : "better",
      label: "Commencement delay",
    });
  }
  if (previous.current_stage && current.current_stage && previous.current_stage !== current.current_stage) {
    push("current_stage", previous.current_stage, current.current_stage, {
      direction: "info",
      label: "Lifecycle stage",
    });
  }

  const prevRes = previous.resources || {};
  const currRes = current.resources || {};
  for (const cat of new Set([...Object.keys(prevRes), ...Object.keys(currRes)])) {
    const a = prevRes[cat];
    const b = currRes[cat];
    if (a !== b) {
      const worse = resourceSeverity(b) > resourceSeverity(a);
      changes.push({
        field: "resources",
        category: cat,
        from: a || "unknown",
        to: b || "unknown",
        to_status: b,
        direction: worse ? "worse" : resourceSeverity(b) < resourceSeverity(a) ? "better" : "info",
        label: resourceLabel(cat),
        evidence: "observed",
        evidence_label: "Observed",
      });
    }
  }

  const prevClr = new Set(previous.clearances || []);
  const currClr = new Set(current.clearances || []);
  const added = [...currClr].filter((x) => !prevClr.has(x));
  const removed = [...prevClr].filter((x) => !currClr.has(x));
  if (added.length || removed.length) {
    changes.push({
      field: "clearances",
      from: [...prevClr],
      to: [...currClr],
      added,
      removed,
      direction: added.length > removed.length ? "worse" : removed.length > added.length ? "better" : "info",
      label: "Clearance status",
      evidence: "observed",
      evidence_label: "Observed",
    });
  }

  if (num(current.open_alerts) !== num(previous.open_alerts)) {
    const d = num(current.open_alerts) - num(previous.open_alerts);
    push("open_alerts", previous.open_alerts, current.open_alerts, {
      delta: d,
      direction: d > 0 ? "worse" : "better",
      label: "Open alerts",
    });
  }

  return { changes, primary_driver: primaryDriver(changes) };
}

export function pickBaselineReview(reviewsDesc, currentState) {
  if (!reviewsDesc?.length) return null;
  const fp = fingerprint(currentState);
  for (const row of reviewsDesc) {
    const st = parseReviewState(row);
    if (fingerprint(st) !== fp) return row;
  }
  return null;
}

export function whatChangedFromReviews(reviewsDesc, currentState) {
  const baseline = pickBaselineReview(reviewsDesc, currentState);
  if (!baseline) {
    return {
      available: false,
      reason: "no_previous_review",
      previous: null,
      current: currentState,
      changes: [],
      primary_driver: null,
      health_delta: null,
    };
  }
  const previous = parseReviewState(baseline);
  const { changes, primary_driver } = diffStates(previous, currentState);
  return {
    available: true,
    previous_review_id: baseline.id,
    previous_at: baseline.created_at,
    previous,
    current: currentState,
    changes,
    primary_driver,
    health_delta: num(currentState.health_score) - num(previous.health_score),
  };
}

export function whyItMatters(driver, changes) {
  if (!driver) return "No review-to-review difference is stored yet.";
  if (driver.field === "forecast_slippage_days") {
    return "The prototype trajectory estimates more (or less) slippage from current rates of progress. This is a forecast, not a guaranteed completion date.";
  }
  if (driver.field === "resources") {
    return "This readiness change is recorded on the project and is an input to both rule-based health and the prototype forecast.";
  }
  if (driver.field === "overdue_critical" || driver.field === "overdue_milestones") {
    return "Overdue critical work is observed in the task/milestone register and directly reduces the critical-task and milestone health factors.";
  }
  if (driver.field === "physical_progress") {
    return "System-calculated physical progress (task average) moved versus the previous review. That gap feeds the physical-progress health factor.";
  }
  const worse = (changes || []).filter((c) => c.direction === "worse").length;
  if (worse > 1) {
    return "Several recorded fields moved against the plan. The item above is the ranked likely driver among those observed changes — not a confirmed single cause.";
  }
  return "This field changed between reviews and is used by the existing monitoring rules.";
}

export function driverKind(changes, driver) {
  if (!driver) return null;
  const worseObserved = (changes || []).filter((c) => c.direction === "worse" && (c.evidence || evidenceFor(c.field)) === "observed");
  if (worseObserved.length > 1) return "likely_driver";
  if ((driver.evidence || evidenceFor(driver.field)) === "forecast") return "forecast";
  if ((driver.evidence || evidenceFor(driver.field)) === "analysis") return "likely_driver";
  return "observed";
}

export function recommendedFromChange(what, insights) {
  const driver = what?.primary_driver;
  const fallback = insights?.outlook?.recommended_action || insights?.health?.intervention || "Review the flagged bottleneck and assign a time-bound officer action.";
  let rec;
  if (!driver) {
    rec = { action: fallback, why: insights?.outlook?.why?.[0] || "No review-to-review change is stored yet." };
  } else if (driver.field === "resources") {
    rec = {
      action: `Escalate ${driver.label} readiness and review the related procurement / supply milestone.`,
      why: `${driver.label} changed from ${driver.from} to ${driver.to}.`,
    };
  } else if (driver.field === "overdue_milestones") {
    rec = {
      action: "Re-baseline the overdue milestone and assign an owner with a recovery date.",
      why: `Overdue milestones ${driver.from} → ${driver.to}.`,
    };
  } else if (driver.field === "overdue_critical") {
    rec = {
      action: "Review overdue critical tasks and the assigned intervention.",
      why: `Overdue critical tasks ${driver.from} → ${driver.to}.`,
    };
  } else if (driver.field === "physical_progress") {
    rec = {
      action: "Confirm site constraints blocking physical progress and set a weekly recovery target.",
      why: `Physical progress ${driver.from}% → ${driver.to}%.`,
    };
  } else if (driver.field === "clearances") {
    rec = {
      action: "Escalate pending clearances with the responsible authority.",
      why: "Delayed or blocked clearances increased.",
    };
  } else {
    rec = { action: fallback, why: `${driver.label || driver.field} changed.` };
  }
  return {
    ...rec,
    why_it_matters: whyItMatters(driver, what?.changes),
    driver_kind: driverKind(what?.changes, driver),
  };
}

export function cloneDeep(value) {
  return JSON.parse(JSON.stringify(value));
}

function applyScenario(cloneProject, scenario) {
  const s = scenario || {};
  if (s.resource_category) {
    if (!RESOURCE_IDS.has(s.resource_category)) {
      throw Object.assign(new Error("Unknown resource_category."), { status: 400 });
    }
    const row = (cloneProject.resources || []).find((r) => r.category === s.resource_category);
    if (!row) {
      throw Object.assign(new Error("Resource category is not on this project."), { status: 400 });
    }
    if (s.resource_status) {
      if (!RESOURCE_STATUS_IDS.has(s.resource_status)) {
        throw Object.assign(new Error("Unknown resource_status."), { status: 400 });
      }
      row.status = s.resource_status;
    }
    if (s.resolve_in_days != null && s.resolve_in_days !== "") {
      const days = Number(s.resolve_in_days);
      if (!Number.isFinite(days) || days < 0) {
        throw Object.assign(new Error("resolve_in_days must be a non-negative number."), { status: 400 });
      }
      row.status = days === 0 ? "ready" : "ready";
    }
  } else if (s.resource_status || s.resolve_in_days != null && s.resolve_in_days !== "") {
    throw Object.assign(new Error("resource_category is required when changing resource readiness."), { status: 400 });
  }

  if (s.weekly_progress_pct != null && s.weekly_progress_pct !== "") {
    const bump = Number(s.weekly_progress_pct);
    if (!Number.isFinite(bump)) {
      throw Object.assign(new Error("weekly_progress_pct must be a number."), { status: 400 });
    }
    for (const t of cloneProject.tasks || []) {
      t.progress = Math.max(0, Math.min(100, num(t.progress) + bump));
      if (t.progress >= 100) t.status = "done";
    }
  }

  if (s.progress_delta != null && s.progress_delta !== "") {
    const bump = Number(s.progress_delta);
    if (!Number.isFinite(bump)) {
      throw Object.assign(new Error("progress_delta must be a number."), { status: 400 });
    }
    for (const t of cloneProject.tasks || []) {
      t.progress = Math.max(0, Math.min(100, num(t.progress) + bump));
      if (t.progress >= 100) t.status = "done";
    }
  }

  if (s.milestone_id && s.milestone_status) {
    const m = (cloneProject.milestones || []).find((x) => Number(x.id) === Number(s.milestone_id));
    if (m) m.status = s.milestone_status;
  }

  if (s.task_id && s.task_status) {
    const t = (cloneProject.tasks || []).find((x) => Number(x.id) === Number(s.task_id));
    if (t) {
      t.status = s.task_status;
      if (s.task_status === "done") t.progress = 100;
    }
  }

  if (s.clearance_name && s.clearance_status) {
    const p = (cloneProject.preconstructions || []).find((x) => x.name === s.clearance_name);
    if (p) p.status = s.clearance_status;
  }

  return cloneProject;
}

export function simulateScenario(project, insights, scenario) {
  if (scenario?.extra_slippage_days != null && scenario.extra_slippage_days !== "") {
    const n = Number(scenario.extra_slippage_days);
    if (!Number.isFinite(n) || n < 0) {
      throw Object.assign(new Error("extra_slippage_days must be a non-negative number."), { status: 400 });
    }
  }
  if (scenario?.resolve_in_days != null && scenario.resolve_in_days !== "") {
    const n = Number(scenario.resolve_in_days);
    if (!Number.isFinite(n) || n < 0) {
      throw Object.assign(new Error("resolve_in_days must be a non-negative number."), { status: 400 });
    }
  }

  const clone = applyScenario(cloneDeep(project), scenario);
  const analyzed = analyzeProject(intelInput(clone));
  const health = analyzed.health;
  const remainingWait =
    scenario?.resolve_in_days != null && scenario.resolve_in_days !== "" ? Number(scenario.resolve_in_days) : 0;
  const extra = remainingWait + (scenario?.extra_slippage_days != null && scenario.extra_slippage_days !== "" ? Number(scenario.extra_slippage_days) : 0);
  const forecast = forecastProject({
    project: clone,
    insights: analyzed,
    preconstructions: clone.preconstructions || [],
    lifecycle_stages: clone.lifecycle_stages || [],
    resources: clone.resources || [],
    extraSlippageDays: extra,
  });
  const currentSlip = num(insights?.forecast?.estimated_slippage_days);
  const scenarioSlip = num(forecast.estimated_slippage_days);
  const changedFactors = [];
  if (health.band !== insights?.health?.band) {
    changedFactors.push({ factor: "health_band", from: insights?.health?.band, to: health.band });
  }
  if (round1(health.score - num(insights?.health?.score)) !== 0) {
    changedFactors.push({
      factor: "health_score",
      from: insights?.health?.score,
      to: health.score,
      delta: round1(health.score - num(insights?.health?.score)),
    });
  }
  if (analyzed.progress !== insights?.progress) {
    changedFactors.push({
      factor: "physical_progress",
      from: insights?.progress,
      to: analyzed.progress,
      delta: analyzed.progress - num(insights?.progress),
    });
  }
  if (scenarioSlip !== currentSlip) {
    changedFactors.push({
      factor: "forecast_slippage_days",
      from: currentSlip,
      to: scenarioSlip,
      delta: scenarioSlip - currentSlip,
    });
  }
  const currRes = {};
  for (const r of project.resources || []) currRes[r.category] = r.status;
  for (const r of clone.resources || []) {
    if (currRes[r.category] !== r.status) {
      changedFactors.push({ factor: "resource", category: r.category, from: currRes[r.category], to: r.status });
    }
  }

  const assumptions = [
    "Scenario only. The live project is not modified.",
    "Existing project records are retained except the scenario inputs below.",
    "Rule-based five-factor health is reused (weights unchanged).",
    "Prototype trajectory forecast is reused (not a trained ML model).",
  ];
  if (scenario?.resource_category) {
    assumptions.push(
      `${resourceLabel(scenario.resource_category)} is treated as ready in the scenario` +
        (remainingWait > 0 ? `, with ${remainingWait} remaining calendar day(s) added to the forecast.` : ".")
    );
  }
  if (scenario?.weekly_progress_pct) {
    assumptions.push(`Each task's recorded progress is increased by ${scenario.weekly_progress_pct} percentage point(s) for a one-week illustration.`);
  }
  if (scenario?.progress_delta) {
    assumptions.push(`Each task's recorded progress is shifted by ${scenario.progress_delta} percentage point(s).`);
  }

  const currentFactors = insights?.health?.factors || {};
  const recalc = describeSimulationRecalc(currentFactors, health.factors, {
    health_from: insights?.health?.score,
    health_to: health.score,
    health_delta: round1(health.score - num(insights?.health?.score)),
    forecast_delta: scenarioSlip - currentSlip,
    physical_delta: analyzed.progress - num(insights?.progress),
  });

  return {
    kind: "scenario_simulation",
    scenario_only: true,
    assumptions,
    recalc,
    disclaimer:
      "Deterministic simulation using the same five-factor health rules and prototype forecast as live monitoring. Not a guaranteed real-world prediction. The live project is not modified.",
    current: {
      health_score: insights?.health?.score,
      health_band: insights?.health?.band,
      physical_progress: insights?.progress,
      forecast_slippage_days: currentSlip,
      forecast_finish: insights?.forecast?.estimated_completion,
      forecast_risk: insights?.forecast?.schedule_risk,
      resources: (project.resources || []).map((r) => ({ category: r.category, status: r.status })),
      factors: currentFactors,
    },
    scenario: {
      inputs: scenario || {},
      health_score: health.score,
      health_band: health.band,
      physical_progress: analyzed.progress,
      forecast_slippage_days: scenarioSlip,
      forecast_finish: forecast.estimated_completion,
      forecast_risk: forecast.schedule_risk,
      resources: (clone.resources || []).map((r) => ({ category: r.category, status: r.status })),
      factors: health.factors,
    },
    delta: {
      health_score: round1(health.score - num(insights?.health?.score)),
      forecast_slippage_days: scenarioSlip - currentSlip,
      expected_recovery_days: currentSlip - scenarioSlip,
      physical_progress: analyzed.progress - num(insights?.progress),
    },
    changed_factors: changedFactors,
  };
}

const FACTOR_LABELS = {
  schedule: "Schedule",
  physical_progress: "Physical progress",
  financial_progress: "Finance",
  milestones: "Milestones",
  critical_tasks: "Critical tasks",
};

export function describeSimulationRecalc(currentFactors, scenarioFactors, delta) {
  const floor_factors = [];
  const moved_factors = [];
  for (const [key, label] of Object.entries(FACTOR_LABELS)) {
    const from = currentFactors?.[key];
    const to = scenarioFactors?.[key];
    if (from == null || to == null) continue;
    if (from !== to) moved_factors.push({ key, label, from, to });
    else if (Number(from) === 0 && Number(to) === 0) floor_factors.push({ key, label, from, to });
  }
  const notes = [
    "Health and forecast were recalculated with the same rule-based engines used for live monitoring.",
    "Scenario only — nothing is written to the project, tasks, resources, or interventions.",
  ];
  const healthDelta = Number(delta?.health_delta) || 0;
  if (healthDelta === 0) {
    if (floor_factors.length) {
      notes.push(
        `Composite health stayed ${delta.health_from} because ${floor_factors.map((f) => f.label).join(", ")} ${
          floor_factors.length === 1 ? "is" : "are"
        } already at the floor (0/100). Changing one readiness item cannot raise a floored factor until the underlying tasks, milestones, or schedule gap also move.`
      );
    } else {
      notes.push(`Composite health stayed ${delta.health_from}. Forecast and readiness were still recalculated under the same rules.`);
    }
  } else {
    notes.push(
      `Composite health moved ${delta.health_from} → ${delta.health_to} because the existing five-factor rules were applied to the scenario inputs — not a hardcoded recovery.`
    );
    if (floor_factors.length) {
      notes.push(`Still at floor (0/100): ${floor_factors.map((f) => f.label).join(", ")}.`);
    }
  }
  return {
    engines: ["rule_based_health", "prototype_trajectory"],
    composite_health_unchanged: healthDelta === 0,
    floor_factors,
    moved_factors,
    notes,
  };
}

export function listReviews(db, projectId) {
  return db
    .prepare(
      "SELECT id, project_id, created_at, source, state_json FROM project_reviews WHERE project_id = ? ORDER BY created_at DESC, id DESC"
    )
    .all(Number(projectId));
}

export function maybeCaptureReview(db, project, insights, source = "auto") {
  const state = captureState(project, insights);
  const rows = listReviews(db, project.id);
  const latest = rows[0] ? parseReviewState(rows[0]) : null;
  if (latest && fingerprint(latest) === fingerprint(state)) return null;
  const createdAt = new Date().toISOString();
  const info = db
    .prepare("INSERT INTO project_reviews (project_id, created_at, source, state_json) VALUES (?, ?, ?, ?)")
    .run(project.id, createdAt, source, JSON.stringify(state));
  return { id: Number(info.lastInsertRowid), created_at: createdAt, source, state };
}

export function insertReview(db, project, insights, source = "review", createdAt = new Date().toISOString()) {
  const state = captureState(project, insights);
  const info = db
    .prepare("INSERT INTO project_reviews (project_id, created_at, source, state_json) VALUES (?, ?, ?, ?)")
    .run(project.id, createdAt, source, JSON.stringify(state));
  return { id: Number(info.lastInsertRowid), created_at: createdAt, source, state };
}

export function whatChangedForProject(db, project, insights) {
  const current = captureState(project, insights);
  const reviews = listReviews(db, project.id);
  const result = whatChangedFromReviews(reviews, current);
  const rec = recommendedFromChange(result, insights);
  const kind = driverKind(result.changes, result.primary_driver);
  return {
    ...result,
    recommended_intervention: rec,
    why_it_matters: rec.why_it_matters,
    driver_kind: kind,
    empty_reason: result.available ? null : "No previous review is available for comparison.",
  };
}

export function eventLane(type) {
  if (["health_down", "forecast_up", "resource_risk", "milestone", "critical_task", "commencement_delay"].includes(type)) {
    return "consequence";
  }
  if (["intervention_created"].includes(type)) return "response";
  if (["intervention_completed", "intervention_cancelled", "health_up", "forecast_down", "resource_recovery"].includes(type)) {
    return "outcome";
  }
  return "event";
}

function dedupeTimeline(events) {
  const seen = new Set();
  const out = [];
  for (const e of events) {
    const key = `${e.at}|${e.type}|${e.title}|${e.detail || ""}|${e.intervention_id || ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

export function buildDecisionTimeline(project, insights, reviewsAsc, auditRows, interventions) {
  const events = [];
  const push = (at, type, title, detail, extra = {}) => {
    if (!at) return;
    events.push({ at, type, title, detail: detail || null, lane: eventLane(type), ...extra });
  };

  push(project.created_at, "created", "Project registered", project.name);
  push(project.tender_award_date || project.award_date, "tender", "Tender accepted / awarded", project.tender_status);
  push(project.work_order_date, "work_order", "Work order issued", project.work_order_number);
  push(project.planned_commencement_date, "commencement_planned", "Planned commencement", project.planned_commencement_date);
  push(project.actual_commencement_date, "commencement", "Commencement recorded", project.actual_commencement_date);
  const delay = insights?.commencement_delay_days ?? project.commencement_delay_days;
  if (delay && delay > 0 && project.actual_commencement_date) {
    push(project.actual_commencement_date, "commencement_delay", "Commencement delayed", `${delay} day(s) after planned start`);
  }

  for (let idx = 0; idx < (reviewsAsc || []).length; idx += 1) {
    const row = reviewsAsc[idx];
    const state = parseReviewState(row);
    if (!state) continue;
    if (idx === 0) {
      push(row.created_at, "review", "Review snapshot recorded", `Health ${state.health_score} (${state.health_band})`);
      continue;
    }
    const prev = parseReviewState(reviewsAsc[idx - 1]);
    const { changes, primary_driver } = diffStates(prev, state);
    if (!changes.length) continue;
    const healthCh = changes.find((c) => c.field === "health_score");
    const slipCh = changes.find((c) => c.field === "forecast_slippage_days");
    const resCh = changes.find((c) => c.field === "resources" && c.direction === "worse");
    const resBetter = changes.find((c) => c.field === "resources" && c.direction === "better");
    if (healthCh?.direction === "worse") {
      push(row.created_at, "health_down", "Health deteriorated", `${healthCh.from} → ${healthCh.to}`, { changes, primary_driver });
    } else if (healthCh?.direction === "better") {
      push(row.created_at, "health_up", "Health improved", `${healthCh.from} → ${healthCh.to}`, { changes, primary_driver });
    }
    if (slipCh?.direction === "worse") {
      push(row.created_at, "forecast_up", "Forecast delay increased", `${slipCh.from} → ${slipCh.to} days`);
    } else if (slipCh?.direction === "better") {
      push(row.created_at, "forecast_down", "Forecast delay reduced", `${slipCh.from} → ${slipCh.to} days`);
    }
    if (resCh) push(row.created_at, "resource_risk", `${resCh.label} deteriorated`, `${resCh.from} → ${resCh.to}`);
    if (resBetter) push(row.created_at, "resource_recovery", `${resBetter.label} restored`, `${resBetter.from} → ${resBetter.to}`);
    const mil = changes.find((c) => c.field === "overdue_milestones" && c.direction === "worse");
    if (mil) push(row.created_at, "milestone", "Milestone pressure", `Overdue milestones ${mil.from} → ${mil.to}`);
    const crit = changes.find((c) => c.field === "overdue_critical" && c.direction === "worse");
    if (crit) push(row.created_at, "critical_task", "Critical task overdue", `Overdue critical tasks ${crit.from} → ${crit.to}`);
    if (!healthCh && !slipCh && !resCh && !resBetter && !mil && !crit) {
      push(row.created_at, "review", "Project state changed", primary_driver?.label || `${changes.length} field(s)`, {
        changes,
        primary_driver,
      });
    }
  }

  // Intentionally omit raw audit-log rows: the Decisions tab is a decision history, not a database dump.

  for (const iv of interventions || []) {
    push(iv.created_at, "intervention_created", "Intervention created", iv.action, {
      intervention_id: iv.id,
      status: iv.status,
      recommended_action: iv.recommended_action,
      trigger_summary: iv.trigger_summary,
    });
    if (iv.status === "resolved") {
      push(iv.completed_at || iv.created_at, "intervention_completed", "Intervention completed", iv.outcome || iv.action, {
        intervention_id: iv.id,
      });
    } else if (iv.status === "cancelled") {
      push(iv.completed_at || iv.created_at, "intervention_cancelled", "Intervention cancelled", iv.outcome || iv.action, {
        intervention_id: iv.id,
      });
    }
  }

  events.sort((a, b) => String(a.at).localeCompare(String(b.at)) || String(a.type).localeCompare(String(b.type)));
  return dedupeTimeline(events);
}

export function classifyBoardGroup(row) {
  const band = row.health_band;
  const trend = row.trend;
  if (band === "critical" || (band === "at_risk" && trend === "worse")) return "immediate";
  if (band === "at_risk" || (band === "watch" && trend === "worse")) return "at_risk";
  if (trend === "better" && band !== "critical") return "improving";
  if (band === "on_track" || (band === "watch" && trend !== "worse")) return "on_track";
  return "at_risk";
}

export function trendFromDelta(healthDelta) {
  if (healthDelta == null) return "new";
  if (healthDelta <= -3) return "worse";
  if (healthDelta >= 3) return "better";
  return "stable";
}

export function buildDecisionBoard(rows) {
  const grouped = { immediate: [], at_risk: [], improving: [], on_track: [] };
  for (const row of rows) {
    grouped[classifyBoardGroup(row)].push(row);
  }
  for (const k of Object.keys(grouped)) {
    grouped[k].sort((a, b) => (a.health_score ?? 99) - (b.health_score ?? 99));
  }

  const currentCounts = {
    critical: rows.filter((r) => r.health_band === "critical").length,
    at_risk: rows.filter((r) => r.health_band === "at_risk").length,
    watch: rows.filter((r) => r.health_band === "watch").length,
    on_track: rows.filter((r) => r.health_band === "on_track").length,
  };
  const priorCounts = { critical: 0, at_risk: 0, watch: 0, on_track: 0 };
  let hasHistory = false;
  for (const r of rows) {
    if (r.previous_band) {
      hasHistory = true;
      if (priorCounts[r.previous_band] != null) priorCounts[r.previous_band] += 1;
    }
  }

  const movement = hasHistory
    ? {
        critical: { from: priorCounts.critical, to: currentCounts.critical, delta: currentCounts.critical - priorCounts.critical },
        at_risk: { from: priorCounts.at_risk, to: currentCounts.at_risk, delta: currentCounts.at_risk - priorCounts.at_risk },
        watch: { from: priorCounts.watch, to: currentCounts.watch, delta: currentCounts.watch - priorCounts.watch },
        on_track: { from: priorCounts.on_track, to: currentCounts.on_track, delta: currentCounts.on_track - priorCounts.on_track },
      }
    : null;

  const deteriorated = rows.filter((r) => r.trend === "worse").length;
  const improved = rows.filter((r) => r.trend === "better").length;
  const insights = [];
  if (grouped.immediate.length) {
    insights.push(`${grouped.immediate.length} project${grouped.immediate.length === 1 ? "" : "s"} require immediate attention.`);
  }
  if (hasHistory && deteriorated) {
    insights.push(`${deteriorated} project${deteriorated === 1 ? "" : "s"} deteriorated since the previous review.`);
  }
  if (hasHistory && improved) {
    insights.push(`${improved} project${improved === 1 ? "" : "s"} improved since the previous review.`);
  }
  const bottleneckCounts = {};
  for (const p of grouped.immediate.concat(grouped.at_risk)) {
    if (p.bottleneck) bottleneckCounts[p.bottleneck] = (bottleneckCounts[p.bottleneck] || 0) + 1;
  }
  const topBottleneck = Object.entries(bottleneckCounts).sort((a, b) => b[1] - a[1])[0];
  if (topBottleneck) insights.push(`Highest-risk bottleneck among attention projects: ${topBottleneck[0]}.`);
  const urgent = grouped.immediate[0];
  if (urgent?.recommended_action) insights.push(`Most urgent recommended action: ${urgent.recommended_action}`);

  return {
    generated_at: new Date().toISOString(),
    groups: grouped,
    counts: currentCounts,
    summary: {
      total: rows.length,
      requires_attention: grouped.immediate.length + grouped.at_risk.length,
      immediate: grouped.immediate.length,
      improving: grouped.improving.length,
      on_track: grouped.on_track.length,
      deteriorated: hasHistory ? deteriorated : null,
      improved: hasHistory ? improved : null,
    },
    insights,
    movement,
    movement_available: Boolean(movement),
    disclaimer:
      "Prioritisation uses live five-factor health, the prototype forecast, and review-to-review change. This is not an ML ranking.",
  };
}

export function priorityReason(changed) {
  const worse = (changed?.changes || []).filter((c) => c.direction === "worse" && c.field !== "health_score" && c.field !== "health_band");
  const labels = [];
  if (changed?.primary_driver?.label) labels.push(changed.primary_driver.label);
  for (const c of worse) {
    const lab = c.label || c.field;
    if (!labels.includes(lab)) labels.push(lab);
    if (labels.length >= 3) break;
  }
  if (!labels.length) return changed?.available ? "No material deterioration versus the last distinct review." : "No previous review stored.";
  return labels.join(" + ");
}

export function boardRowsFromProjects(db, projects) {
  return projects.map((p) => {
    const insights = p.insights;
    const changed = whatChangedForProject(db, p, insights);
    const rec = changed.recommended_intervention;
    const recent = changed.changes?.find((c) => c.direction === "worse") || changed.primary_driver;
    return {
      id: p.id,
      name: p.name,
      health_score: insights.health?.score,
      health_band: insights.health?.band,
      previous_band: changed.previous?.health_band || null,
      trend: trendFromDelta(changed.health_delta),
      forecast_slippage_days: insights.forecast?.estimated_slippage_days,
      forecast_risk: insights.forecast?.schedule_risk || null,
      bottleneck: insights.outlook?.bottleneck?.label || changed.primary_driver?.label || null,
      recent_change: recent
        ? `${recent.label || recent.field}: ${Array.isArray(recent.from) ? recent.from.join(", ") : recent.from} → ${Array.isArray(recent.to) ? recent.to.join(", ") : recent.to}`
        : changed.available
          ? "No material change since the last distinct review"
          : "No previous review is available for comparison.",
      recommended_action: rec?.action || insights.outlook?.recommended_action,
      primary_driver: changed.primary_driver,
      health_delta: changed.health_delta,
      priority_reason: priorityReason(changed),
      driver_kind: changed.driver_kind,
    };
  });
}

export function validateInterventionPayload(body, { partial = false } = {}) {
  const errors = [];
  if (!partial && !String(body.action || "").trim()) errors.push("action is required");
  if (body.status != null && body.status !== "" && !INTERVENTION_STATUSES.includes(body.status)) {
    errors.push(`status must be one of ${INTERVENTION_STATUSES.join(", ")}`);
  }
  if (body.priority != null && body.priority !== "" && !INTERVENTION_PRIORITIES.includes(body.priority)) {
    errors.push("priority must be medium, high, or critical");
  }
  if (body.due_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.due_date)) || Number.isNaN(new Date(`${body.due_date}T00:00:00Z`).getTime())) {
      errors.push("due_date must be YYYY-MM-DD");
    }
  }
  if (body.completed_at) {
    const d = new Date(body.completed_at);
    if (Number.isNaN(d.getTime())) errors.push("completed_at must be a valid date");
  }
  return errors;
}

export function interventionWriteFields(body, existing = {}) {
  const status = body.status || existing.status || "open";
  let completedAt = body.completed_at !== undefined ? body.completed_at : existing.completed_at || null;
  if ((status === "resolved" || status === "cancelled") && !completedAt) {
    completedAt = new Date().toISOString();
  }
  if (status === "open" || status === "in_progress") {
    // Client PUTs spread the full row; do not keep a completion timestamp on open work.
    completedAt = null;
  }
  return {
    action: String(body.action ?? existing.action ?? "").trim(),
    recommended_action: body.recommended_action != null ? String(body.recommended_action) : existing.recommended_action || "",
    actual_action: body.actual_action != null ? String(body.actual_action) : existing.actual_action || "",
    trigger_summary: body.trigger_summary != null ? String(body.trigger_summary) : existing.trigger_summary || "",
    outcome: body.outcome != null ? String(body.outcome) : existing.outcome || "",
    authority: body.authority != null ? String(body.authority) : existing.authority || "",
    assigned_officer: body.assigned_officer != null ? String(body.assigned_officer) : existing.assigned_officer || "",
    due_date: body.due_date !== undefined ? body.due_date || null : existing.due_date || null,
    priority: body.priority || existing.priority || "high",
    status,
    completed_at: completedAt,
    issue_id: body.issue_id !== undefined ? body.issue_id || null : existing.issue_id || null,
  };
}
