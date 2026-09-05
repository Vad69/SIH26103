export function deriveSmartAlerts({
  project,
  insights,
  forecast,
  preconstructions = [],
  lifecycle_stages = [],
  resources = [],
}) {
  const out = [];
  const health = insights.health || {};
  const finance = insights.finance || {};
  if (health.band === "critical") {
    out.push({
      code: "health_critical",
      severity: "critical",
      title: `${project.name} is Critical`,
      explanation: health.early_warning_text || health.band_explanation,
    });
  } else if (health.band === "at_risk") {
    out.push({
      code: "health_at_risk",
      severity: "high",
      title: `${project.name} is At Risk`,
      explanation: health.early_warning_text || health.band_explanation,
    });
  }
  if (insights.overdue_critical_count >= 1) {
    out.push({
      code: "critical_task_overdue",
      severity: "high",
      title: `Critical task overdue — ${project.name}`,
      explanation: `${insights.overdue_critical_count} critical task(s) are past due.`,
    });
  }
  const lateMs = (insights.alerts || []).find((a) => a.code === "late_milestones");
  if (lateMs) {
    out.push({
      code: "milestone_overdue",
      severity: "warning",
      title: `Milestone overdue — ${project.name}`,
      explanation: lateMs.message,
    });
  }
  const blocked = preconstructions.filter((c) => c.status === "delayed" || c.status === "blocked");
  if (blocked.length) {
    out.push({
      code: "clearance_blocked",
      severity: blocked.some((c) => c.status === "blocked") ? "critical" : "high",
      title: `Pre-construction blocker — ${project.name}`,
      explanation: blocked.map((c) => `${c.name} (${c.status})`).join("; "),
    });
  }
  if (forecast?.schedule_risk === "high" && forecast.estimated_slippage_days >= 30) {
    out.push({
      code: "forecast_slippage",
      severity: "high",
      title: `Forecast slippage ${forecast.estimated_slippage_days} days — ${project.name}`,
      explanation: (forecast.drivers || []).slice(0, 3).join(" "),
    });
  }
  if (forecast?.cost_overrun_risk === "high") {
    out.push({
      code: "forecast_cost",
      severity: "warning",
      title: `Projected financial risk — ${project.name}`,
      explanation: `Cost-overrun risk is high (revised vs approved ${finance.cost_overrun_pct}%).`,
    });
  }
  if (finance.physical_financial_mismatch >= 15) {
    out.push({
      code: "physical_financial_mismatch",
      severity: "warning",
      title: `Physical-Financial Mismatch — ${project.name}`,
      explanation: `Financial progress ${finance.financial_progress}% vs system-calculated physical progress ${insights.progress}%.`,
    });
  }
  const delayedStages = lifecycle_stages.filter((s) => s.status === "delayed" || s.status === "blocked");
  for (const s of delayedStages) {
    const code = `${s.stage_key}_delay`;
    out.push({
      code,
      severity: s.status === "blocked" ? "critical" : s.stage_key === "commencement" || s.stage_key === "tender" || s.stage_key === "award" ? "high" : "warning",
      title: `${s.stage_key.replaceAll("_", " ")} ${s.status} — ${project.name}`,
      explanation: s.delay_reason || s.remarks || `Lifecycle stage is ${s.status}.`,
    });
  }
  const blockedRes = resources.filter((r) => r.status === "delayed" || r.status === "blocked");
  if (blockedRes.length) {
    out.push({
      code: "resource_blocked",
      severity: blockedRes.some((r) => r.status === "blocked") ? "critical" : "high",
      title: `Resource blocker — ${project.name}`,
      explanation: blockedRes.map((r) => `${r.category.replaceAll("_", " ")} (${r.status}${r.delay_reason ? `: ${r.delay_reason}` : ""})`).join("; "),
    });
  }
  if (insights.commencement_delay_days > 0) {
    out.push({
      code: "commencement_delay",
      severity: insights.commencement_delay_days >= 21 ? "high" : "warning",
      title: `${insights.commencement_delay_days} days commencement delay — ${project.name}`,
      explanation: project.commencement_delay_reason || "Actual commencement is after the planned date.",
    });
  }
  if (project.tender_status === "delayed") {
    out.push({
      code: "tender_delay",
      severity: "high",
      title: `Tender delayed — ${project.name}`,
      explanation: project.tender_delay_reason || project.tender_remarks || "Tender monitoring status is delayed.",
    });
  }
  if (health.score != null && health.score <= 40) {
    out.push({
      code: "score_drop",
      severity: "informational",
      title: `Health score ${health.score}/100 — ${project.name}`,
      explanation: "Composite rule-based score is in the lowest band.",
    });
  }
  return out;
}

export function syncProjectAlerts(db, { project, alerts }) {
  const existing = db.prepare("SELECT * FROM alerts WHERE project_id = ?").all(project.id);
  const byCode = Object.fromEntries(existing.map((r) => [r.code, r]));
  const now = new Date().toISOString();
  for (const a of alerts) {
    const prev = byCode[a.code];
    if (prev) {
      db.prepare("UPDATE alerts SET severity = ?, title = ?, explanation = ? WHERE id = ?").run(
        a.severity,
        a.title,
        a.explanation,
        prev.id
      );
    } else {
      db.prepare(
        `INSERT INTO alerts (project_id, code, severity, title, explanation, created_at, read_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL)`
      ).run(project.id, a.code, a.severity, a.title, a.explanation, now);
    }
  }
  const keep = new Set(alerts.map((a) => a.code));
  for (const row of existing) {
    if (!keep.has(row.code)) {
      db.prepare("DELETE FROM alerts WHERE id = ?").run(row.id);
    }
  }
}
