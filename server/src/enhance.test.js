import test from "node:test";
import assert from "node:assert/strict";
import { classifyBottleneck, NLP_VERSION } from "./nlp.js";
import { forecastProject } from "./forecast.js";
import { analyzeProject } from "./insights.js";
import { validateProjectNumbers } from "./validate.js";

test("NLP classifies environmental text without claiming official data", () => {
  const r = classifyBottleneck("Environmental approval has not arrived and construction at the site cannot proceed.");
  assert.equal(r.category, "environmental_clearance");
  assert.ok(r.confidence > 0.5);
  assert.match(r.explanation, /synthetic/i);
  assert.equal(r.version, NLP_VERSION);
});

test("NLP empty text falls back safely", () => {
  const r = classifyBottleneck("  ");
  assert.equal(r.category, "other");
  assert.equal(r.confidence, 0);
});

test("forecast is labelled as prototype trajectory not ML", () => {
  const insights = analyzeProject({
    project: {
      start_date: "2025-01-01",
      end_date: "2026-06-30",
      original_end_date: "2026-06-30",
      revised_end_date: "2026-12-31",
      original_cost: 100,
      revised_cost: 120,
      expenditure: 40,
      funds_released: 50,
      status: "active",
    },
    tasks: [{ status: "todo", due_date: "2026-01-01", priority: "critical", progress: 10 }],
    milestones: [],
    issues: [],
    preconstructions: [{ name: "EC", category: "environmental_clearance", status: "delayed" }],
  }, new Date("2026-09-01T12:00:00Z"));
  const f = forecastProject({
    project: { status: "active", start_date: "2025-01-01", end_date: "2026-06-30" },
    insights,
    preconstructions: [{ name: "EC", status: "delayed" }],
  }, new Date("2026-09-01T12:00:00Z"));
  assert.equal(f.method, "prototype_trajectory");
  assert.match(f.method_note, /not a trained ML/i);
  assert.ok(f.estimated_slippage_days >= 0);
  assert.ok(f.drivers.length);
});

test("completed project forecast is low risk", () => {
  const insights = analyzeProject({
    project: { start_date: "2025-01-01", end_date: "2025-12-15", status: "completed", original_cost: 1, revised_cost: 1, expenditure: 1 },
    tasks: [{ status: "done", due_date: "2025-01-01", priority: "low", progress: 100 }],
  }, new Date("2026-09-01T12:00:00Z"));
  const f = forecastProject({
    project: { status: "completed", end_date: "2025-12-15", start_date: "2025-01-01" },
    insights,
  });
  assert.equal(f.schedule_risk, "low");
  assert.equal(f.estimated_slippage_days, 0);
});

test("funds released cannot exceed revised cost", () => {
  assert.match(
    validateProjectNumbers({ original_cost: 10, revised_cost: 10, expenditure: 1, funds_released: 12 }),
    /released/
  );
});
