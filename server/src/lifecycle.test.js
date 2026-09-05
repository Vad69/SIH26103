import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProject } from "./insights.js";
import { forecastProject } from "./forecast.js";
import { deriveSmartAlerts } from "./alerts.js";
import { commencementDelayDays, currentStage, validateLifecyclePatch } from "./lifecycle.js";
import { classifyBottleneck } from "./nlp.js";
import { flashReportPayload, qpisrPayload } from "./reports.js";

test("commencement delay is the calendar gap when both dates exist", () => {
  assert.equal(commencementDelayDays("2026-01-10", "2026-02-02"), 23);
  assert.equal(commencementDelayDays("2026-01-10", null), null);
});

test("lifecycle validation rejects unknown status and bad dates", () => {
  assert.match(validateLifecyclePatch({ status: "maybe" }), /status/i);
  assert.match(validateLifecyclePatch({ planned_date: "10-01-2026" }), /YYYY-MM-DD/);
  assert.equal(validateLifecyclePatch({ status: "delayed", planned_date: "2026-01-10" }), null);
});

test("current stage is the first incomplete stage", () => {
  const cur = currentStage([
    { stage_key: "pre_construction", sort_order: 1, status: "completed" },
    { stage_key: "tender", sort_order: 2, status: "delayed" },
    { stage_key: "execution", sort_order: 7, status: "not_started" },
  ]);
  assert.equal(cur.stage_key, "tender");
});

test("current stage prefers in-progress work over an earlier delayed stage", () => {
  const cur = currentStage([
    { stage_key: "pre_construction", sort_order: 1, status: "delayed" },
    { stage_key: "execution", sort_order: 7, status: "in_progress" },
  ]);
  assert.equal(cur.stage_key, "execution");
});

test("delayed lifecycle and blocked resources contribute to the existing health engine", () => {
  const result = analyzeProject(
    {
      project: {
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        original_end_date: "2026-12-31",
        revised_end_date: "2026-12-31",
        original_cost: 100,
        revised_cost: 100,
        expenditure: 20,
        funds_released: 25,
        status: "active",
        planned_commencement_date: "2026-01-10",
        actual_commencement_date: "2026-02-02",
      },
      tasks: [{ status: "in_progress", due_date: "2026-10-01", priority: "medium", progress: 40 }],
      milestones: [],
      issues: [],
      preconstructions: [],
      lifecycle_stages: [{ stage_key: "tender", status: "delayed", sort_order: 2 }],
      resources: [{ category: "materials", status: "blocked", delay_reason: "Supplier delivery delay" }],
    },
    new Date("2026-03-01T12:00:00Z")
  );
  assert.ok(result.health.reasons.some((r) => /lifecycle/i.test(r.text)));
  assert.ok(result.health.reasons.some((r) => /resource/i.test(r.text)));
  assert.ok(result.health.reasons.some((r) => /23 days commencement delay/.test(r.text)));
  assert.equal(result.commencement_delay_days, 23);
  assert.equal(result.health.factor_rows.length, 5);
});

test("forecast drivers include commencement and resource delays", () => {
  const insights = analyzeProject(
    {
      project: {
        start_date: "2025-01-01",
        end_date: "2026-06-30",
        original_end_date: "2026-06-30",
        revised_end_date: "2026-12-31",
        original_cost: 100,
        revised_cost: 120,
        expenditure: 80,
        funds_released: 90,
        status: "active",
        planned_commencement_date: "2025-02-01",
        actual_commencement_date: "2025-03-01",
      },
      tasks: [{ status: "todo", due_date: "2026-01-01", priority: "critical", progress: 10 }],
      lifecycle_stages: [{ stage_key: "commissioning", status: "delayed" }],
      resources: [{ category: "materials", status: "delayed", delay_reason: "Supplier delivery delay" }],
      preconstructions: [],
    },
    new Date("2026-09-01T12:00:00Z")
  );
  const f = forecastProject(
    {
      project: { status: "active", start_date: "2025-01-01", end_date: "2026-06-30" },
      insights,
      lifecycle_stages: [{ stage_key: "commissioning", status: "delayed" }],
      resources: [{ category: "materials", status: "delayed", delay_reason: "Supplier delivery delay" }],
    },
    new Date("2026-09-01T12:00:00Z")
  );
  assert.match(f.method_note, /not a trained ML/i);
  assert.ok(f.drivers.some((d) => /commissioning/i.test(d) || /materials/i.test(d) || /Commencement/i.test(d)));
});

test("NLP still classifies material-supply wording", () => {
  const r = classifyBottleneck("Material delivery from supplier is delayed.");
  assert.equal(r.category, "equipment");
});

test("smart alerts include tender, resource, mismatch and commencement codes", () => {
  const insights = {
    health: { band: "at_risk", score: 50, reasons: [] },
    progress: 35,
    overdue_critical_count: 0,
    alerts: [],
    finance: { physical_financial_mismatch: 33, financial_progress: 68, cost_overrun_pct: 2 },
    commencement_delay_days: 23,
  };
  const alerts = deriveSmartAlerts({
    project: { name: "Demo canal (seed)", tender_status: "delayed", tender_delay_reason: "Retender" },
    insights,
    forecast: { schedule_risk: "low", estimated_slippage_days: 0 },
    preconstructions: [],
    lifecycle_stages: [{ stage_key: "handover", status: "delayed", delay_reason: "Defects list open" }],
    resources: [{ category: "materials", status: "blocked", delay_reason: "Supplier delivery delay" }],
  });
  const codes = alerts.map((a) => a.code);
  assert.ok(codes.includes("tender_delay"));
  assert.ok(codes.includes("resource_blocked"));
  assert.ok(codes.includes("physical_financial_mismatch"));
  assert.ok(codes.includes("commencement_delay"));
  assert.ok(codes.includes("handover_delay"));
});

test("reports include lifecycle stage on project rows", () => {
  const projects = [
    {
      id: 1,
      name: "Demo",
      current_stage_label: "Execution",
      progress: 40,
      original_cost: 10,
      revised_cost: 12,
      funds_released: 8,
      expenditure: 7,
      data_source: "demo",
      insights: { health: { band: "watch", score: 70 }, forecast: { schedule_risk: "medium" }, outlook: { current_stage_label: "Execution" } },
      resources: [{ category: "materials", status: "delayed" }],
      preconstructions: [],
      issues: [],
      interventions: [],
      milestones: [],
      testing_status: "not_started",
      commissioning_status: "not_started",
      handover_status: "not_started",
    },
  ];
  const flash = flashReportPayload(projects, { period: "September 2026", generated_at: "2026-09-02", total_projects: 1 });
  assert.equal(flash.projects[0].lifecycle_stage, "Execution");
  const q = qpisrPayload(projects, { period: "Q2", generated_at: "2026-09-02" });
  assert.equal(q.projects[0].lifecycle_stage, "Execution");
  assert.deepEqual(q.projects[0].resource_blocked, ["materials"]);
});
