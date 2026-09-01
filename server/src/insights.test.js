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
