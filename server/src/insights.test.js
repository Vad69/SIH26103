import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProject, scheduleElapsedPct } from "./insights.js";

const project = {
  start_date: "2026-01-01",
  end_date: "2026-12-31",
  status: "active",
};

test("critical overdue tasks produce the delay headline", () => {
  const result = analyzeProject(
    {
      project,
      milestones: [],
      tasks: [
        { status: "todo", due_date: "2026-01-10", priority: "critical", progress: 10 },
        { status: "todo", due_date: "2026-01-12", priority: "critical", progress: 0 },
        { status: "todo", due_date: "2026-01-15", priority: "critical", progress: 20 },
        { status: "done", due_date: "2026-01-01", priority: "low", progress: 100 },
      ],
    },
    new Date("2026-06-01T12:00:00Z")
  );

  assert.equal(result.headline.code, "critical_overdue");
  assert.match(result.headline.message, /3 critical tasks are overdue/);
  assert.equal(result.overdue_critical_count, 3);
});

test("healthy project is marked on track", () => {
  const result = analyzeProject(
    {
      project: { ...project, start_date: "2026-08-01", end_date: "2026-12-31" },
      milestones: [],
      tasks: [
        { status: "in_progress", due_date: "2026-10-01", priority: "medium", progress: 40 },
        { status: "todo", due_date: "2026-11-01", priority: "low", progress: 10 },
      ],
    },
    new Date("2026-08-15T12:00:00Z")
  );

  assert.equal(result.headline.code, "on_track");
});

test("schedule elapsed is clamped", () => {
  assert.equal(scheduleElapsedPct("2026-01-01", "2026-01-11", "2026-01-01"), 0);
  assert.equal(scheduleElapsedPct("2026-01-01", "2026-01-11", "2026-01-11"), 100);
});

test("cost overrun and health band are explainable", () => {
  const result = analyzeProject(
    {
      project: {
        name: "Highway X",
        start_date: "2025-01-01",
        end_date: "2026-06-30",
        original_end_date: "2026-06-30",
        revised_end_date: "2026-12-31",
        original_cost: 1250,
        revised_cost: 1480,
        expenditure: 820,
        status: "active",
      },
      milestones: [{ status: "pending", due_date: "2026-01-01" }],
      tasks: [
        { status: "todo", due_date: "2026-01-10", priority: "critical", progress: 20 },
        { status: "todo", due_date: "2026-01-12", priority: "critical", progress: 10 },
      ],
      issues: [{ status: "open", severity: "critical" }],
    },
    new Date("2026-09-01T12:00:00Z")
  );
  assert.equal(result.finance.cost_overrun_pct, 18.4);
  assert.ok(result.health.score < 65);
  assert.ok(["at_risk", "critical"].includes(result.health.band));
  assert.equal(result.health.early_warning, true);
});
