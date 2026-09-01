/**
 * Lightweight, explainable project-health heuristics.
 * No ML — just overdue work, critical path pressure, and schedule vs progress.
 */

export function todayISO(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const ms = new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`);
  return Math.round(ms / 86400000);
}

export function scheduleElapsedPct(startDate, endDate, today = todayISO()) {
  const total = daysBetween(startDate, endDate);
  if (total <= 0) return today >= endDate ? 100 : 0;
  const elapsed = daysBetween(startDate, today);
  return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
}

export function analyzeProject({ project, tasks, milestones }, now = new Date()) {
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
    : 0;
  const elapsed = scheduleElapsedPct(project.start_date, project.end_date, today);

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

  return {
    progress,
    schedule_elapsed_pct: elapsed,
    overdue_count: overdue.length,
    overdue_critical_count: overdueCritical.length,
    upcoming_count: upcoming.length,
    alerts,
    headline: alerts[0],
  };
}
