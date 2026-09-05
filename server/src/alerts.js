export function deriveSmartAlerts({ project, insights, forecast, preconstructions = [] }) {
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
