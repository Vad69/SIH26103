import { delayLabel } from "./constants.js";

export function nlpCounts(projects) {
  const counts = {};
  for (const p of projects) {
    for (const issue of p.issues || []) {
      const cat = issue.nlp_accepted_category || issue.category;
      if (!cat) continue;
      counts[cat] = (counts[cat] || 0) + 1;
    }
    if (p.delay_reason) counts[p.delay_reason] = (counts[p.delay_reason] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([id, count]) => ({ id, label: delayLabel(id), count }))
    .sort((a, b) => b.count - a.count);
}

export function flashReportPayload(projects, extras) {
  return {
    report_type: "monthly_flash",
    official: false,
    disclaimer:
      "Pragati prototype flash report. Not an official MoSPI / PAIMANA document. Combines demo, imported and manual records with rule-based health, prototype trajectory forecasts and optional NLP suggestions.",
    ...extras,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      ministry: p.ministry,
      health: p.insights?.health?.band,
      score: p.insights?.health?.score,
      forecast_risk: p.insights?.forecast?.schedule_risk,
      slippage_days: p.insights?.forecast?.estimated_slippage_days,
      calculated_progress: p.progress,
      reported_progress: p.reported_physical_progress,
      original_cost: p.original_cost,
      revised_cost: p.revised_cost,
      funds_released: p.funds_released,
      expenditure: p.expenditure,
      delay_reason: p.delay_reason ? delayLabel(p.delay_reason) : "",
      data_source: p.data_source,
      lifecycle_stage: p.current_stage_label || p.insights?.outlook?.current_stage_label || "",
      commencement_delay_days: p.commencement_delay_days,
      mismatch: p.insights?.outlook?.mismatch || null,
    })),
  };
}

export function qpisrPayload(projects, extras) {
  return {
    report_type: "qpisr_style",
    official: false,
    disclaimer:
      "Pragati prototype QPISR-style status report. Not an official Quarterly Project Implementation Status Report.",
    ...extras,
    projects: projects.map((p) => {
      const ms = p.milestones || [];
      const precon = p.preconstructions || [];
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        status: p.computed_status,
        health: p.insights?.health?.band,
        forecast_risk: p.insights?.forecast?.schedule_risk,
        estimated_completion: p.insights?.forecast?.estimated_completion,
        physical_progress: p.progress,
        reported_physical_progress: p.reported_physical_progress,
        financial_progress: p.insights?.finance?.financial_progress,
        sanctioned: p.original_cost,
        anticipated: p.revised_cost,
        funds_released: p.funds_released,
        expenditure: p.expenditure,
        cost_variance_pct: p.insights?.finance?.cost_overrun_pct,
        schedule_variance_days: p.insights?.finance?.time_overrun_days,
        milestones_done: ms.filter((m) => m.status === "completed").length,
        milestones_total: ms.length,
        precon_blocked: precon.filter((c) => c.status === "delayed" || c.status === "blocked").map((c) => c.name),
        issues: (p.issues || []).filter((i) => i.status !== "resolved").map((i) => i.title),
        interventions: (p.interventions || []).filter((i) => i.status !== "resolved" && i.status !== "cancelled").map((i) => i.action),
        bottleneck: p.insights?.outlook?.bottleneck?.label || delayLabel(p.delay_reason),
        lifecycle_stage: p.current_stage_label || p.insights?.outlook?.current_stage_label || "",
        resource_blocked: (p.resources || [])
          .filter((r) => r.status === "delayed" || r.status === "blocked")
          .map((r) => r.category),
        testing_status: p.testing_status,
        commissioning_status: p.commissioning_status,
        handover_status: p.handover_status,
        commencement_delay_days: p.commencement_delay_days,
        mismatch: p.insights?.outlook?.mismatch || null,
        data_source: p.data_source,
      };
    }),
  };
}

export function reportLines(kind, payload) {
  const lines = [
    `PRAGATI — ${kind}`,
    `Period: ${payload.period || ""}`,
    `Generated: ${payload.generated_at || ""}`,
    "",
    payload.disclaimer,
    "",
    `Total projects: ${payload.total_projects}`,
    `Requiring attention: ${payload.requiring_attention}`,
    `Critical: ${payload.critical_projects}`,
    `Cost overruns: ${payload.cost_overruns}`,
    `Schedule overruns: ${payload.schedule_overruns}`,
    `Newly at risk / critical: ${(payload.newly_risk || []).join("; ") || "None"}`,
    `Improving: ${(payload.improving || []).join("; ") || "None"}`,
    `Deteriorating: ${(payload.deteriorating || []).join("; ") || "None"}`,
    "",
    "Major delay / NLP-assisted bottleneck counts:",
    ...(payload.nlp_bottlenecks || payload.major_delay_reasons || []).slice(0, 8).map((r) => `- ${r.label}: ${r.count}`),
    "",
    "Projects:",
  ];
  for (const p of payload.projects || []) {
    lines.push(
      `${p.name} | stage ${p.lifecycle_stage || ""} | health ${p.health || ""} | forecast ${p.forecast_risk || ""} | calc ${p.physical_progress ?? p.calculated_progress}% | sanctioned ${p.sanctioned ?? p.original_cost} Cr | released ${p.funds_released} Cr | exp ${p.expenditure} Cr | source ${p.data_source}`
    );
  }
  lines.push("", "Open interventions:");
  for (const iv of payload.open_interventions || []) {
    lines.push(`- ${iv.action} (${iv.status})`);
  }
  lines.push("", "Critical pre-construction blockers:");
  for (const b of payload.precon_blockers || []) {
    lines.push(`- ${b}`);
  }
  lines.push("", "Resource blockers:");
  for (const b of payload.resource_blockers || []) {
    lines.push(`- ${b}`);
  }
  lines.push("", `Delayed tender: ${(payload.delayed_tender || []).join("; ") || "None"}`);
  lines.push(`Delayed award: ${(payload.delayed_award || []).join("; ") || "None"}`);
  lines.push(`Commencement delays: ${(payload.delayed_commencement || []).join("; ") || "None"}`);
  return lines;
}
