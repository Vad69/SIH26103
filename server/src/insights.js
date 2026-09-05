/**
 * Project Risk Intelligence Engine — explainable, rules-based.
 * No ML. Scores schedule, physical progress, finance, milestones, critical tasks.
 */
import { delayLabel } from "./constants.js";
import { commencementDelayDays, delayedStagesForPenalty } from "./lifecycle.js";

export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  if (!a || !b) return 0;
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function scheduleElapsedPct(startDate, endDate, today = todayISO()) {
  const total = daysBetween(startDate, endDate);
  if (total <= 0) return today >= endDate ? 100 : 0;
  const elapsed = daysBetween(startDate, today);
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

function clamp(n, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

export function financeMetrics(project, now = new Date()) {
  const today = todayISO(now);
  const originalCost = Number(project.original_cost || 0);
  const revisedCost = Number(project.revised_cost || originalCost);
  const expenditure = Number(project.expenditure || 0);
  const fundsReleased = Number(project.funds_released || 0);
  const originalEnd = project.original_end_date || project.end_date;
  const revisedEnd = project.revised_end_date || project.end_date;
  const costOverrunPct = originalCost > 0 ? ((revisedCost - originalCost) / originalCost) * 100 : 0;
  const financialProgress = revisedCost > 0 ? (expenditure / revisedCost) * 100 : 0;
  const plannedPhysical = scheduleElapsedPct(project.start_date, originalEnd, today);
  let timeOverrunDays = Math.max(0, daysBetween(originalEnd, revisedEnd));
  if (project.status !== "completed" && today > originalEnd) {
    timeOverrunDays = Math.max(timeOverrunDays, daysBetween(originalEnd, today));
  }
  const expectedExpenditure = revisedCost * (plannedPhysical / 100);
  return {
    original_cost: originalCost,
    revised_cost: revisedCost,
    sanctioned_cost: originalCost,
    anticipated_cost: revisedCost,
    funds_released: fundsReleased,
    expenditure,
    cost_overrun_pct: Math.round(costOverrunPct * 10) / 10,
    financial_progress: clamp(financialProgress),
    release_utilization: revisedCost > 0 ? clamp((fundsReleased / revisedCost) * 100) : 0,
    expenditure_utilization: revisedCost > 0 ? clamp((expenditure / revisedCost) * 100) : 0,
    funding_gap: Math.round(Math.max(0, revisedCost - fundsReleased) * 100) / 100,
    planned_physical: plannedPhysical,
    expected_expenditure: Math.round(expectedExpenditure * 100) / 100,
    expenditure_variance: Math.round((expenditure - expectedExpenditure) * 100) / 100,
    original_end: originalEnd,
    revised_end: revisedEnd,
    time_overrun_days: timeOverrunDays,
  };
}

function bandFor(score) {
  if (score >= 80) return "on_track";
  if (score >= 65) return "watch";
  if (score >= 45) return "at_risk";
  return "critical";
}

export function analyzeProject(
  { project, tasks = [], milestones = [], issues = [], preconstructions = [], lifecycle_stages = [], resources = [] },
  now = new Date()
) {
  const today = todayISO(now);
  const overdue = tasks.filter((t) => t.status !== "done" && t.due_date < today);
  const overdueCritical = overdue.filter((t) => t.priority === "critical");
  const overdueHigh = overdue.filter((t) => t.priority === "high" || t.priority === "critical");
  const upcoming = tasks.filter((t) => {
    if (t.status === "done") return false;
    const d = daysBetween(today, t.due_date);
    return d >= 0 && d <= 7;
  });
  const openMilestones = milestones.filter((m) => m.status !== "completed" && m.due_date < today);
  const progress = tasks.length
    ? Math.round(tasks.reduce((s, t) => s + (t.progress ?? 0), 0) / tasks.length)
    : Number(project.physical_progress || 0);
  const finance = financeMetrics(project, now);
  const elapsed = finance.planned_physical;
  const physicalGap = elapsed - progress;
  finance.physical_financial_mismatch = finance.financial_progress - progress;
  const delayedPrecon = preconstructions.filter((c) => c.status === "delayed" || c.status === "blocked");
  const blockedRes = resources.filter((r) => r.status === "delayed" || r.status === "blocked");
  const commenceDelay = commencementDelayDays(project.planned_commencement_date, project.actual_commencement_date);
  const delayedStages = lifecycle_stages.filter((s) => s.status === "delayed" || s.status === "blocked");
  const scoredStages = delayedStagesForPenalty(lifecycle_stages, {
    skipCommencement: commenceDelay != null && commenceDelay > 0,
    skipResourceMobilisation: blockedRes.length > 0,
  });
  const openCriticalIssues = issues.filter((i) => i.status !== "resolved" && i.severity === "critical").length;
  const openIssues = issues.filter((i) => i.status !== "resolved").length;

  const scheduleScore = clamp(
    100 -
      finance.time_overrun_days / 3 -
      Math.max(0, physicalGap) * 1.2 -
      scoredStages.length * 6 -
      blockedRes.length * 8 -
      Math.min(20, Math.max(0, commenceDelay || 0) / 3)
  );
  const physicalScore = clamp(100 - Math.max(0, physicalGap) * 2.2);
  const financialScore = clamp(
    100 -
      Math.abs(finance.financial_progress - progress) * 0.8 -
      Math.max(0, finance.cost_overrun_pct) * 0.7
  );
  const milestoneScore = milestones.length
    ? clamp((milestones.filter((m) => m.status === "completed").length / milestones.length) * 100 - openMilestones.length * 18)
    : 70;
  const criticalScore = clamp(100 - overdueCritical.length * 22 - overdueHigh.length * 6 - openCriticalIssues * 10);

  const factors = {
    schedule: scheduleScore,
    physical_progress: physicalScore,
    financial_progress: financialScore,
    milestones: milestoneScore,
    critical_tasks: criticalScore,
  };
  const score = clamp(
    scheduleScore * 0.25 +
      physicalScore * 0.25 +
      financialScore * 0.2 +
      milestoneScore * 0.15 +
      criticalScore * 0.15
  );
  const band = project.status === "completed" ? "on_track" : bandFor(score);

  const reasons = [];
  if (overdueCritical.length) {
    reasons.push({ severity: "high", text: `${overdueCritical.length} critical task${overdueCritical.length === 1 ? " is" : "s are"} overdue` });
  }
  if (physicalGap >= 8) {
    reasons.push({
      severity: physicalGap >= 15 ? "high" : "medium",
      text: `Physical progress is ${physicalGap}% behind planned progress (${progress}% vs ${elapsed}% expected)`,
    });
  }
  if (openMilestones.length) {
    reasons.push({
      severity: "medium",
      text: `${openMilestones.length} milestone${openMilestones.length === 1 ? " has" : "s have"} been missed`,
    });
  }
  if (finance.time_overrun_days >= 30) {
    reasons.push({
      severity: finance.time_overrun_days >= 120 ? "high" : "medium",
      text: `Revised completion is ${finance.time_overrun_days} days beyond the original date`,
    });
  }
  if (finance.cost_overrun_pct >= 5) {
    reasons.push({
      severity: finance.cost_overrun_pct >= 15 ? "high" : "medium",
      text: `Cost overrun of ${finance.cost_overrun_pct}% (revised vs original approved cost)`,
    });
  }
  if (finance.expenditure < finance.expected_expenditure * 0.85 && elapsed >= 20) {
    reasons.push({
      severity: "medium",
      text: `Expenditure (₹${finance.expenditure} Cr) is below expected financial progress (₹${finance.expected_expenditure} Cr)`,
    });
  }
  if (openCriticalIssues) {
    reasons.push({ severity: "high", text: `${openCriticalIssues} critical bottleneck issue${openCriticalIssues === 1 ? "" : "s"} still open` });
  }
  if (project.delay_reason) {
    reasons.push({ severity: "medium", text: `Recorded delay reason: ${delayLabel(project.delay_reason)}` });
  }
  if (delayedPrecon.length) {
    reasons.push({
      severity: "high",
      text: `${delayedPrecon.length} pre-construction clearance${delayedPrecon.length === 1 ? " is" : "s are"} delayed or blocked`,
    });
  }
  if (finance.funding_gap >= 20 && finance.revised_cost > 0) {
    reasons.push({
      severity: "medium",
      text: `Funding gap of ₹${finance.funding_gap} Cr (anticipated cost vs funds released)`,
    });
  }
  if (finance.physical_financial_mismatch >= 15) {
    reasons.push({
      severity: "medium",
      text: `Physical-Financial Mismatch: financial progress (${finance.financial_progress}%) is ahead of system-calculated physical progress (${progress}%)`,
    });
  }
  if (delayedStages.length) {
    reasons.push({
      severity: delayedStages.some((s) => s.status === "blocked") ? "high" : "medium",
      text: `${delayedStages.length} lifecycle stage${delayedStages.length === 1 ? " is" : "s are"} delayed or blocked (${delayedStages
        .map((s) => s.stage_key.replaceAll("_", " "))
        .join(", ")})`,
    });
  }
  if (blockedRes.length) {
    reasons.push({
      severity: "high",
      text: `${blockedRes.length} resource categor${blockedRes.length === 1 ? "y is" : "ies are"} delayed or blocked (${blockedRes
        .map((r) => r.category.replaceAll("_", " "))
        .join(", ")})`,
    });
  }
  if (commenceDelay != null && commenceDelay > 0) {
    reasons.push({
      severity: commenceDelay >= 21 ? "high" : "medium",
      text: `${commenceDelay} days commencement delay`,
    });
  }

  const alerts = [];
  if (overdueCritical.length) {
    alerts.push({
      severity: "high",
      code: "critical_overdue",
      message: `Project is likely to be delayed because ${overdueCritical.length} critical task${overdueCritical.length === 1 ? " is" : "s are"} overdue.`,
    });
  } else if (overdueHigh.length >= 3) {
    alerts.push({
      severity: "high",
      code: "high_overdue_cluster",
      message: `Project is at risk: ${overdueHigh.length} high-priority tasks are overdue.`,
    });
  } else if (overdue.length) {
    alerts.push({
      severity: "medium",
      code: "overdue_tasks",
      message: `${overdue.length} task${overdue.length === 1 ? " is" : "s are"} overdue and may slip the overall timeline.`,
    });
  }
  if (elapsed - progress >= 15 && project.status !== "completed") {
    alerts.push({
      severity: elapsed - progress >= 30 ? "high" : "medium",
      code: "behind_schedule",
      message: `Progress is behind schedule (${progress}% complete vs ${elapsed}% of the timeline elapsed).`,
    });
  }
  if (openMilestones.length) {
    alerts.push({
      severity: "medium",
      code: "late_milestones",
      message: `${openMilestones.length} milestone${openMilestones.length === 1 ? " has" : "s have"} passed ${openMilestones.length === 1 ? "its" : "their"} due date without completion.`,
    });
  }
  if (upcoming.length && !alerts.some((a) => a.severity === "high")) {
    alerts.push({
      severity: "low",
      code: "upcoming_deadlines",
      message: `${upcoming.length} task${upcoming.length === 1 ? " is" : "s are"} due in the next 7 days.`,
    });
  }
  if (!alerts.length) {
    alerts.push({
      severity: "ok",
      code: "on_track",
      message: "On track — no overdue work and progress is keeping pace with the schedule.",
    });
  }

  const earlyWarning =
    project.status !== "completed" &&
    band !== "on_track" &&
    (physicalGap >= 8 ||
      overdueCritical.length >= 1 ||
      finance.cost_overrun_pct >= 10 ||
      openMilestones.length >= 2 ||
      delayedPrecon.length >= 1 ||
      delayedStages.length >= 1 ||
      blockedRes.length >= 1 ||
      (commenceDelay != null && commenceDelay >= 14));

  let intervention = "Continue routine monitoring. This engine identifies and prioritizes work; it does not close it.";
  if (band === "critical") {
    intervention =
      "Immediate review recommended. Open the Issues and Interventions tabs, then assign or update a time-bound action. The system does not resolve the bottleneck by itself.";
  } else if (band === "at_risk") {
    intervention =
      "Immediate review recommended. Check overdue critical tasks and whether an intervention is already assigned. The system flags the gap; an officer must act.";
  } else if (band === "watch") {
    intervention =
      "Watch-list the project this month. Confirm whether system-calculated progress can catch the original timeline.";
  }

  const whatBits = [];
  if (physicalGap >= 8) {
    whatBits.push(
      `Physical progress is ${physicalGap}% below expected progress (${progress}% system-calculated vs ${elapsed}% planned from the original timeline)`
    );
  }
  if (overdueCritical.length) {
    whatBits.push(
      `${overdueCritical.length} critical task${overdueCritical.length === 1 ? " is" : "s are"} overdue`
    );
  }
  if (finance.cost_overrun_pct >= 10) {
    whatBits.push(`cost overrun is ${finance.cost_overrun_pct}% versus original approved cost`);
  }
  if (openMilestones.length >= 2) {
    whatBits.push(`${openMilestones.length} milestones have passed without completion`);
  }
  if (delayedPrecon.length >= 1) {
    whatBits.push(
      `${delayedPrecon.length} pre-construction item${delayedPrecon.length === 1 ? " is" : "s are"} delayed or blocked`
    );
  }
  if (delayedStages.length) {
    whatBits.push(`${delayedStages.length} lifecycle stage${delayedStages.length === 1 ? " is" : "s are"} delayed or blocked`);
  }
  if (blockedRes.length) {
    whatBits.push(`${blockedRes.length} resource categor${blockedRes.length === 1 ? "y is" : "ies are"} not ready`);
  }
  if (commenceDelay != null && commenceDelay > 0) {
    whatBits.push(`${commenceDelay} days commencement delay`);
  }
  const what = whatBits.join("; ") || reasons[0]?.text || "Slippage indicators have worsened relative to the original plan";
  const reviewBit = overdueCritical.length
    ? "Review delayed critical tasks and the assigned intervention."
    : openIssues
      ? "Review open bottlenecks and intervention status."
      : "Review finance, milestones, and the recorded delay reason.";
  const earlyWarningText = earlyWarning
    ? `${what}. ${reviewBit} The system identifies and prioritizes intervention; it does not close the issue.`
    : null;

  const bandWhy =
    band === "on_track"
      ? `Classified On Track because the composite score is ${score}/100 (80 or above).`
      : band === "watch"
        ? `Classified Watch because the composite score is ${score}/100 (65–79).`
        : band === "at_risk"
          ? `Classified At Risk because the composite score is ${score}/100 (45–64).`
          : `Classified Critical because the composite score is ${score}/100 (below 45).`;

  return {
    progress,
    calculated_progress: progress,
    reported_physical_progress:
      project.reported_physical_progress == null || project.reported_physical_progress === ""
        ? null
        : Number(project.reported_physical_progress),
    progress_method: "System-calculated physical progress based on task progress. Not an official ministry-reported physical progress figure.",
    schedule_elapsed_pct: elapsed,
    schedule_variance: progress - elapsed,
    overdue_count: overdue.length,
    overdue_critical_count: overdueCritical.length,
    upcoming_count: upcoming.length,
    open_issue_count: openIssues,
    alerts,
    headline: alerts[0],
    commencement_delay_days: commenceDelay,
    lifecycle_delayed_count: delayedStages.length,
    resource_blocked_count: blockedRes.length,
    finance,
    health: {
      score,
      band,
      factors,
      reasons,
      intervention,
      factor_rows: [
        { label: "Schedule", score: scheduleScore },
        { label: "Physical Progress", score: physicalScore },
        { label: "Financial Progress", score: financialScore },
        { label: "Milestones", score: milestoneScore },
        { label: "Critical Tasks", score: criticalScore },
      ],
      band_explanation: `${bandWhy} Score is a weighted blend of schedule (25%), physical (25%), financial (20%), milestones (15%) and critical tasks (15%). It is a rule-based decision-support indicator, not an ML prediction.`,
      early_warning: earlyWarning,
      early_warning_text: earlyWarningText,
    },
  };
}
