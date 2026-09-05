/**
 * Prototype trajectory forecast — not a trained ML model and not official PAIMANA.
 * Complements the rule-based current-health engine.
 */
import { daysBetween, todayISO } from "./insights.js";
import { delayLabel } from "./constants.js";
import { delayedStagesForPenalty } from "./lifecycle.js";

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function riskBand(slippageDays, costRisk) {
  if (slippageDays >= 45 || costRisk >= 18) return "high";
  if (slippageDays >= 15 || costRisk >= 8) return "medium";
  return "low";
}

export function forecastProject({ project, insights, preconstructions = [], lifecycle_stages = [], resources = [] }, now = new Date()) {
  const today = todayISO(now);
  if (project.status === "completed") {
    return {
      method: "prototype_trajectory",
      method_note:
        "Prototype schedule/cost trajectory using current rates of progress. Not a trained ML model and not official PAIMANA.",
      estimated_completion: project.end_date,
      estimated_slippage_days: 0,
      schedule_risk: "low",
      cost_overrun_risk: "low",
      confidence: "high",
      confidence_note: "Project is marked completed.",
      drivers: ["Status is completed; no forward slippage is projected."],
    };
  }

  const planned = Number(insights.schedule_elapsed_pct || 0);
  const physical = Number(insights.progress || 0);
  const finance = insights.finance || {};
  const velocity = planned > 5 ? physical / planned : physical > 0 ? 0.5 : 0.15;
  const remainingPct = Math.max(0, 100 - physical);
  const daysElapsed = Math.max(1, daysBetween(project.start_date, today));
  const daysPerPoint = physical > 0 ? daysElapsed / physical : daysElapsed / Math.max(8, planned || 8);
  let extra = Math.round(remainingPct * daysPerPoint * (velocity < 0.55 ? 1.35 : velocity < 0.85 ? 1.1 : 0.95));
  extra = Math.max(0, Math.min(540, extra));

  const delayedClearances = preconstructions.filter(
    (c) => c.status === "delayed" || c.status === "blocked" || (c.computed_status || "") === "delayed"
  );
  extra += delayedClearances.length * 18;
  extra += Number(insights.overdue_critical_count || 0) * 12;
  extra += Math.max(0, Number(finance.time_overrun_days || 0)) * 0.15;
  const delayedStages = delayedStagesForPenalty(lifecycle_stages, {
    skipCommencement: Number(insights.commencement_delay_days || 0) > 0,
    skipPreconstruction: delayedClearances.length > 0,
    skipResourceMobilisation: resources.some((r) => r.status === "delayed" || r.status === "blocked"),
  });
  const blockedRes = resources.filter((r) => r.status === "delayed" || r.status === "blocked");
  extra += delayedStages.length * 10;
  extra += blockedRes.length * 14;
  extra += Math.max(0, Number(insights.commencement_delay_days || 0)) * 0.4;

  const baselineEnd = finance.revised_end || finance.original_end || project.end_date;
  const estimated = addDays(today, extra);
  const slippage = Math.max(0, daysBetween(baselineEnd, estimated));

  const costPct = Number(finance.cost_overrun_pct || 0);
  const fundingGap = Number(finance.funding_gap || 0);
  const mismatch = Number(finance.physical_financial_mismatch || 0);
  let costRisk = costPct;
  if (fundingGap > 0 && finance.revised_cost > 0) costRisk += (fundingGap / finance.revised_cost) * 40;
  if (mismatch > 12) costRisk += 6;

  const schedule_risk = riskBand(slippage, costRisk);
  const cost_overrun_risk = costRisk >= 15 ? "high" : costRisk >= 7 ? "medium" : "low";

  const dataBits = [
    project.start_date && project.end_date,
    Number.isFinite(physical),
    finance.revised_cost > 0,
    preconstructions.length > 0,
  ].filter(Boolean).length;
  const confidence = dataBits >= 4 ? "medium" : dataBits >= 3 ? "medium" : "low";

  const drivers = [];
  if (physical + 8 < planned) {
    drivers.push(`Physical progress is below the planned trajectory (${physical}% vs ${planned}% elapsed).`);
  }
  if (insights.overdue_critical_count) {
    drivers.push(`${insights.overdue_critical_count} critical activit${insights.overdue_critical_count === 1 ? "y is" : "ies are"} overdue.`);
  }
  for (const c of delayedClearances.slice(0, 3)) {
    drivers.push(`${c.name || delayLabel(c.category)} is ${c.status}.`);
  }
  for (const s of delayedStages.slice(0, 3)) {
    drivers.push(`Lifecycle stage ${s.stage_key.replaceAll("_", " ")} is ${s.status}.`);
  }
  for (const r of blockedRes.slice(0, 3)) {
    drivers.push(`${r.category.replaceAll("_", " ")} readiness is ${r.status}${r.delay_reason ? ` (${r.delay_reason})` : ""}.`);
  }
  if (insights.commencement_delay_days > 0) {
    drivers.push(`Commencement was delayed by ${insights.commencement_delay_days} days.`);
  }
  if (finance.funds_released > 0 && finance.expenditure + 8 < finance.funds_released) {
    drivers.push("Funds have been released faster than expenditure (possible absorption lag).");
  }
  if (finance.revised_cost > 0 && finance.funds_released + 8 < finance.revised_cost && physical < 50) {
    drivers.push("Approved/anticipated cost is high relative to funds released, with slow physical progress.");
  }
  if (mismatch > 12) {
    drivers.push("Financial utilization is ahead of system-calculated physical progress.");
  } else if (mismatch < -12) {
    drivers.push("Physical progress is ahead of recorded financial utilization.");
  }
  if (!drivers.length) {
    drivers.push("Trajectory is close to the current plan; residual risk is limited.");
  }

  return {
    method: "prototype_trajectory",
    method_note:
      "Prototype forecast from current physical velocity, overdue work, clearance delays and finance gaps. Not a trained ML model, not historical MoSPI data, and not an official PAIMANA indicator.",
    estimated_completion: estimated,
    estimated_slippage_days: slippage,
    schedule_risk,
    cost_overrun_risk,
    confidence,
    confidence_note:
      confidence === "low"
        ? "Limited structured fields; treat the date as an illustration of trajectory, not a prediction."
        : "Medium confidence: enough current fields to sketch a trajectory, but there is no trained historical model.",
    drivers,
    inputs_used: {
      planned_progress: planned,
      calculated_progress: physical,
      reported_physical_progress: insights.reported_physical_progress,
      overdue_critical: insights.overdue_critical_count,
      delayed_clearances: delayedClearances.length,
      delayed_lifecycle_stages: delayedStages.length,
      blocked_resources: blockedRes.length,
      commencement_delay_days: insights.commencement_delay_days,
      cost_overrun_pct: finance.cost_overrun_pct,
      funds_released: finance.funds_released,
      expenditure: finance.expenditure,
    },
  };
}
