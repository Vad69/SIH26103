import test from "node:test";
import assert from "node:assert/strict";
import {
  captureState,
  diffStates,
  primaryDriver,
  whatChangedFromReviews,
  simulateScenario,
  classifyBoardGroup,
  trendFromDelta,
  buildDecisionBoard,
  buildDecisionTimeline,
  validateInterventionPayload,
  interventionWriteFields,
  fingerprint,
  whyItMatters,
  driverKind,
  priorityReason,
  eventLane,
} from "./decision.js";
import { analyzeProject } from "./insights.js";
import { forecastProject } from "./forecast.js";
import { buildOutlook } from "./outlook.js";

function sampleBundle(overrides = {}) {
  const project = {
    id: 1,
    name: "PLFS Digital Field Operations",
    start_date: "2026-01-15",
    end_date: "2026-09-30",
    original_end_date: "2026-09-30",
    revised_end_date: "2026-12-15",
    original_cost: 186,
    revised_cost: 214,
    expenditure: 97,
    funds_released: 110,
    status: "active",
    planned_commencement_date: "2026-05-20",
    actual_commencement_date: "2026-06-12",
    tasks: [
      { id: 1, status: "done", due_date: "2026-03-20", priority: "high", progress: 100 },
      { id: 2, status: "todo", due_date: "2026-04-30", priority: "critical", progress: 10 },
      { id: 3, status: "todo", due_date: "2026-05-01", priority: "critical", progress: 0 },
    ],
    milestones: [
      { id: 10, status: "completed", due_date: "2026-03-31" },
      { id: 11, status: "in_progress", due_date: "2026-05-15" },
    ],
    issues: [],
    preconstructions: [{ name: "State tablet tender", status: "delayed", category: "procurement" }],
    lifecycle_stages: [{ stage_key: "execution", status: "in_progress", sort_order: 7 }],
    resources: [
      { category: "materials", status: "blocked" },
      { category: "human_resources", status: "ready" },
      { category: "equipment", status: "delayed" },
      { category: "logistics", status: "partial" },
      { category: "site_readiness", status: "blocked" },
    ],
    ...overrides,
  };
  const insightsCore = analyzeProject(
    {
      project,
      tasks: project.tasks,
      milestones: project.milestones,
      issues: project.issues,
      preconstructions: project.preconstructions,
      lifecycle_stages: project.lifecycle_stages,
      resources: project.resources,
    },
    new Date("2026-09-05T12:00:00Z")
  );
  const forecast = forecastProject(
    {
      project,
      insights: insightsCore,
      preconstructions: project.preconstructions,
      lifecycle_stages: project.lifecycle_stages,
      resources: project.resources,
    },
    new Date("2026-09-05T12:00:00Z")
  );
  const outlook = buildOutlook({
    project,
    insights: insightsCore,
    forecast,
    issues: project.issues,
    interventions: [],
    preconstructions: project.preconstructions,
    lifecycle_stages: project.lifecycle_stages,
    resources: project.resources,
  });
  const insights = { ...insightsCore, forecast, outlook };
  return { project, insights };
}

test("what-changed: no previous snapshot", () => {
  const current = { health_score: 41, health_band: "critical", physical_progress: 27 };
  const result = whatChangedFromReviews([], current);
  assert.equal(result.available, false);
  assert.equal(result.reason, "no_previous_review");
  assert.deepEqual(result.changes, []);
});

test("what-changed: valid previous snapshot with health deterioration", () => {
  const previous = {
    health_score: 72,
    health_band: "watch",
    physical_progress: 42,
    financial_progress: 38,
    expenditure: 82,
    forecast_slippage_days: 12,
    overdue_critical: 0,
    overdue_milestones: 0,
    resources: { materials: "partial" },
    clearances: [],
  };
  const current = {
    health_score: 41,
    health_band: "critical",
    physical_progress: 27,
    financial_progress: 38,
    expenditure: 97,
    forecast_slippage_days: 31,
    overdue_critical: 2,
    overdue_milestones: 1,
    resources: { materials: "blocked" },
    clearances: ["State tablet tender"],
  };
  const reviews = [{ id: 1, created_at: "2026-06-20", state_json: JSON.stringify(previous) }];
  const result = whatChangedFromReviews(reviews, current);
  assert.equal(result.available, true);
  assert.ok(result.health_delta < 0);
  assert.ok(result.changes.some((c) => c.field === "physical_progress" && c.direction === "worse"));
  assert.ok(result.changes.some((c) => c.field === "overdue_milestones"));
  assert.ok(result.changes.some((c) => c.field === "resources" && c.to === "blocked"));
  assert.equal(result.primary_driver.field, "resources");
  assert.equal(result.changes.find((c) => c.field === "resources").evidence, "observed");
  assert.equal(result.changes.find((c) => c.field === "forecast_slippage_days").evidence, "forecast");
  assert.equal(driverKind(result.changes, result.primary_driver), "likely_driver");
});

test("what-changed: health improvement and progress change", () => {
  const { changes, primary_driver } = diffStates(
    { health_score: 41, health_band: "critical", physical_progress: 20, forecast_slippage_days: 40, resources: { materials: "blocked" } },
    { health_score: 63, health_band: "watch", physical_progress: 35, forecast_slippage_days: 18, resources: { materials: "ready" } }
  );
  assert.ok(changes.some((c) => c.field === "health_score" && c.direction === "better"));
  assert.ok(changes.some((c) => c.field === "resources" && c.direction === "better"));
  assert.ok(primary_driver);
});

test("primary driver ranks blocked materials over a health drop when both occur", () => {
  const driver = primaryDriver([
    { field: "health_score", delta: -17, direction: "worse", label: "Project health" },
    { field: "resources", to: "blocked", to_status: "blocked", direction: "worse", label: "Materials" },
  ]);
  assert.equal(driver.field, "resources");
});

test("what-if does not mutate the live project and is deterministic", () => {
  const { project, insights } = sampleBundle();
  const before = JSON.stringify(project.resources);
  const a = simulateScenario(project, insights, { resource_category: "materials", resolve_in_days: 7 });
  const b = simulateScenario(project, insights, { resource_category: "materials", resolve_in_days: 7 });
  assert.equal(JSON.stringify(project.resources), before);
  assert.equal(a.scenario.forecast_slippage_days, b.scenario.forecast_slippage_days);
  assert.equal(a.kind, "scenario_simulation");
  assert.match(a.disclaimer, /not a guaranteed/i);
});

test("what-if material resolution reduces projected delay versus current", () => {
  const { project, insights } = sampleBundle();
  const result = simulateScenario(project, insights, { resource_category: "materials", resolve_in_days: 7 });
  assert.equal(result.current.resources.find((r) => r.category === "materials").status, "blocked");
  assert.equal(result.scenario.resources.find((r) => r.category === "materials").status, "ready");
  assert.ok(result.delta.expected_recovery_days > 0);
  assert.ok(result.scenario.forecast_slippage_days < result.current.forecast_slippage_days);
});

test("what-if progress improvement updates physical progress", () => {
  const { project, insights } = sampleBundle();
  const result = simulateScenario(project, insights, { weekly_progress_pct: 3 });
  assert.ok(result.scenario.physical_progress >= insights.progress);
  assert.ok(result.changed_factors.some((f) => f.factor === "physical_progress"));
});

test("what-if rejects invalid input", () => {
  const { project, insights } = sampleBundle();
  assert.throws(() => simulateScenario(project, insights, { resource_category: "materials", resolve_in_days: -1 }), /non-negative/);
  assert.throws(() => simulateScenario(project, insights, { weekly_progress_pct: "fast" }), /number/);
  assert.throws(() => simulateScenario(project, insights, { resource_category: "unicorns", resolve_in_days: 1 }), /Unknown resource/);
});

test("what-if allows missing optional progress input", () => {
  const { project, insights } = sampleBundle();
  const result = simulateScenario(project, insights, { resource_category: "materials", resource_status: "ready" });
  assert.ok(Number.isFinite(result.scenario.health_score));
});

test("intervention validation and status transitions", () => {
  assert.ok(validateInterventionPayload({}).length);
  assert.equal(validateInterventionPayload({ action: "Escalate supplier", due_date: "2026-09-12", status: "open" }).length, 0);
  assert.ok(validateInterventionPayload({ action: "x", status: "DONE" }).length);
  assert.ok(validateInterventionPayload({ action: "x", due_date: "12-09-2026" }).length);
  const open = interventionWriteFields({ action: "Escalate", assigned_officer: "Project Manager", due_date: "2026-09-12" });
  assert.equal(open.status, "open");
  assert.equal(open.assigned_officer, "Project Manager");
  const done = interventionWriteFields({ status: "resolved", outcome: "Kits delivered" }, { action: "Escalate", status: "open" });
  assert.equal(done.status, "resolved");
  assert.ok(done.completed_at);
  assert.equal(done.outcome, "Kits delivered");
  const cancelled = interventionWriteFields({ status: "cancelled" }, { action: "Escalate", status: "open" });
  assert.equal(cancelled.status, "cancelled");
});

test("executive board prioritises critical projects and handles no history", () => {
  const rows = [
    { id: 1, name: "A", health_score: 41, health_band: "critical", trend: "worse", previous_band: "watch" },
    { id: 2, name: "B", health_score: 88, health_band: "on_track", trend: "better", previous_band: "watch" },
    { id: 3, name: "C", health_score: 70, health_band: "watch", trend: "new" },
  ];
  const board = buildDecisionBoard(rows);
  assert.equal(board.groups.immediate[0].name, "A");
  assert.ok(board.groups.improving.some((p) => p.name === "B"));
  assert.ok(board.groups.on_track.some((p) => p.name === "C"));
  assert.ok(board.movement);
  assert.equal(board.movement_available, true);
  assert.equal(board.summary.immediate, 1);
  assert.ok(board.insights.some((t) => /immediate attention/i.test(t)));
  assert.equal(board.movement.critical.from, 0);
  assert.equal(board.movement.critical.to, 1);
  const fresh = buildDecisionBoard([{ id: 9, name: "New", health_score: 80, health_band: "on_track", trend: "new" }]);
  assert.equal(fresh.movement, null);
  assert.equal(fresh.movement_available, false);
});

test("timeline is chronological and includes intervention, health, forecast, recovery", () => {
  const events = buildDecisionTimeline(
    {
      name: "PLFS",
      created_at: "2026-01-15",
      tender_award_date: "2026-05-05",
      work_order_date: "2026-05-18",
      planned_commencement_date: "2026-05-20",
      actual_commencement_date: "2026-06-12",
      commencement_delay_days: 23,
    },
    { commencement_delay_days: 23 },
    [
      {
        id: 1,
        created_at: "2026-06-20",
        state_json: JSON.stringify({ health_score: 72, health_band: "watch", forecast_slippage_days: 12, resources: { materials: "partial" } }),
      },
      {
        id: 2,
        created_at: "2026-08-02",
        state_json: JSON.stringify({ health_score: 41, health_band: "critical", forecast_slippage_days: 31, resources: { materials: "blocked" } }),
      },
      {
        id: 3,
        created_at: "2026-08-14",
        state_json: JSON.stringify({ health_score: 63, health_band: "watch", forecast_slippage_days: 18, resources: { materials: "ready" } }),
      },
    ],
    [],
    [
      { id: 5, created_at: "2026-08-03", action: "Supplier escalation", status: "open", trigger_summary: "Materials blocked" },
      { id: 5, created_at: "2026-08-03", completed_at: "2026-08-10", action: "Supplier escalation", status: "resolved", outcome: "Supply restored" },
    ]
  );
  const times = events.map((e) => e.at);
  assert.deepEqual(times, [...times].sort());
  assert.ok(events.some((e) => e.type === "health_down"));
  assert.ok(events.some((e) => e.type === "forecast_up"));
  assert.ok(events.some((e) => e.type === "intervention_created"));
  assert.ok(events.some((e) => e.type === "intervention_completed"));
  assert.ok(events.some((e) => e.type === "health_up" || e.type === "resource_recovery"));
});

test("classifyBoardGroup and trend helpers", () => {
  assert.equal(classifyBoardGroup({ health_band: "critical", trend: "stable" }), "immediate");
  assert.equal(classifyBoardGroup({ health_band: "at_risk", trend: "worse" }), "immediate");
  assert.equal(trendFromDelta(null), "new");
  assert.equal(trendFromDelta(-10), "worse");
  assert.equal(trendFromDelta(8), "better");
});

test("captureState fingerprint is stable for identical snapshots", () => {
  const { project, insights } = sampleBundle();
  const a = captureState(project, insights);
  const b = captureState(project, insights);
  a.captured_at = b.captured_at = "x";
  assert.equal(fingerprint(a), fingerprint(b));
});

test("five-factor weights remain unchanged when simulating", () => {
  const { project } = sampleBundle();
  const analyzed = analyzeProject({
    project,
    tasks: project.tasks,
    milestones: project.milestones,
    issues: [],
    preconstructions: project.preconstructions,
    lifecycle_stages: project.lifecycle_stages,
    resources: project.resources,
  });
  assert.equal(analyzed.health.factor_rows.length, 5);
  assert.match(analyzed.health.band_explanation, /schedule \(25%\)/);
});

test("what-if includes assumptions and does not claim guaranteed prediction", () => {
  const { project, insights } = sampleBundle();
  const result = simulateScenario(project, insights, { resource_category: "materials", resolve_in_days: 7 });
  assert.equal(result.scenario_only, true);
  assert.ok(result.assumptions.some((a) => /live project is not modified/i.test(a)));
  assert.match(result.disclaimer, /not a guaranteed/i);
});

test("timeline omits raw audit rows and tags lanes", () => {
  const events = buildDecisionTimeline(
    { name: "X", created_at: "2026-01-01" },
    {},
    [],
    [{ created_at: "2026-02-01", entity: "task", action: "updated", detail: "noise" }],
    [{ id: 1, created_at: "2026-02-02", action: "Act", status: "open", trigger_summary: "Ready" }]
  );
  assert.equal(events.some((e) => e.type === "audit"), false);
  const created = events.find((e) => e.type === "intervention_created");
  assert.equal(created.lane, "response");
  assert.equal(eventLane("health_down"), "consequence");
  assert.equal(eventLane("intervention_completed"), "outcome");
});

test("timeline dedupes identical events", () => {
  const iv = { id: 9, created_at: "2026-03-01", action: "Same", status: "open" };
  const events = buildDecisionTimeline({ name: "X", created_at: "2026-01-01" }, {}, [], [], [iv, iv]);
  assert.equal(events.filter((e) => e.type === "intervention_created").length, 1);
});

test("why-it-matters and empty comparison copy", () => {
  const empty = whatChangedFromReviews([], { health_score: 80 });
  assert.equal(empty.available, false);
  assert.match(whyItMatters(null), /No review-to-review/i);
  const reason = priorityReason({ available: false, changes: [] });
  assert.match(reason, /No previous review/i);
});
