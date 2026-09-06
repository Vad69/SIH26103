import test from "node:test";
import assert from "node:assert/strict";
import { analyzeProject } from "./insights.js";
import { forecastProject } from "./forecast.js";
import { buildOutlook, primaryRiskDriver } from "./outlook.js";
import { classifyBottleneck } from "./nlp.js";
import { boardRowsFromProjects, captureState, buildDecisionBoard } from "./decision.js";
import { qpisrPayload } from "./reports.js";

const NOW = new Date("2026-09-05T12:00:00Z");

function disagreeingBundle() {
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
    delay_reason: null,
    delay_notes: "",
    tasks: [{ id: 1, status: "todo", due_date: "2026-08-01", priority: "high", progress: 20 }],
    milestones: [{ id: 10, status: "in_progress", due_date: "2026-08-15" }],
    issues: [
      {
        title: "material supply of sensors is delayed from the vendor",
        intervention: "",
        owner: "",
        status: "open",
        severity: "low",
        category: "other",
      },
    ],
    preconstructions: [],
    lifecycle_stages: [{ stage_key: "execution", status: "in_progress", sort_order: 7 }],
    resources: [
      { category: "site_readiness", status: "blocked" },
      { category: "equipment", status: "ready" },
      { category: "materials", status: "ready" },
    ],
  };
  const input = {
    project,
    tasks: project.tasks,
    milestones: project.milestones,
    issues: project.issues,
    preconstructions: project.preconstructions,
    lifecycle_stages: project.lifecycle_stages,
    resources: project.resources,
  };
  const insightsCore = analyzeProject(input, NOW);
  const forecast = forecastProject({ project, insights: insightsCore, resources: project.resources }, NOW);
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
  return { project, insights: { ...insightsCore, forecast, outlook }, input };
}

function emptyReviewsDb() {
  return {
    prepare() {
      return { all: () => [] };
    },
  };
}

function reviewsDb(rows) {
  return {
    prepare() {
      return { all: () => rows };
    },
  };
}

test("NLP classifies equipment/material supply independently of site readiness evidence", () => {
  const nlp = classifyBottleneck("material supply of sensors is delayed from the vendor");
  assert.equal(nlp.category, "equipment");
});

test("deterministic primary driver stays site readiness when NLP predicts equipment", () => {
  const { insights } = disagreeingBundle();
  const nlp = insights.outlook.nlp_suggestion;
  const driver = insights.outlook.primary_driver;
  assert.equal(driver.category, "site_readiness");
  assert.match(driver.label, /Site Readiness/i);
  assert.equal(driver.advisory, false);
  assert.equal(driver.source, "deterministic_health_evidence");
  assert.ok(nlp);
  assert.equal(nlp.category, "equipment");
  assert.equal(nlp.advisory, true);
  assert.notEqual(driver.category, nlp.category);
  assert.equal(insights.outlook.bottleneck.category, "site_readiness");
  assert.equal(insights.outlook.bottleneck.label, driver.label);
});

test("NLP cannot change health score or band", () => {
  const withIssue = disagreeingBundle();
  const base = { ...withIssue.input, issues: [] };
  const without = analyzeProject(base, NOW);
  assert.equal(withIssue.insights.health.score, without.health.score);
  assert.equal(withIssue.insights.health.band, without.health.band);
  assert.deepEqual(withIssue.insights.health.factors, without.health.factors);
});

test("primaryRiskDriver does not call or depend on NLP class", () => {
  const { insights, project } = disagreeingBundle();
  const driver = primaryRiskDriver({
    insights,
    project,
    resources: project.resources,
    preconstructions: [],
    lifecycle_stages: project.lifecycle_stages,
  });
  assert.equal(driver.category, "site_readiness");
  assert.equal(driver.advisory, false);
});

test("outlook why lists health evidence and not the NLP class as the first explanation", () => {
  const { insights } = disagreeingBundle();
  assert.ok(insights.outlook.why.some((w) => /resource/i.test(w)));
  assert.equal(
    insights.outlook.why.some((w) => /Equipment|material supply/i.test(w) && /NLP/i.test(w)),
    false
  );
  assert.match(insights.outlook.disclaimer, /advisory/i);
  assert.match(insights.outlook.disclaimer, /do not set the health score/i);
});

test("decision board primary issue follows deterministic evidence, not NLP", () => {
  const { project, insights } = disagreeingBundle();
  const rows = boardRowsFromProjects(emptyReviewsDb(), [{ ...project, insights }]);
  assert.equal(rows.length, 1);
  assert.match(rows[0].bottleneck, /Site Readiness/i);
  assert.equal(rows[0].nlp_suggestion.category, "equipment");
  assert.equal(rows[0].nlp_suggestion.advisory, true);
  assert.notEqual(rows[0].bottleneck, rows[0].nlp_suggestion.label);
  const board = buildDecisionBoard(rows);
  assert.ok(board.insights.some((t) => /Site Readiness/i.test(t)));
  assert.equal(board.insights.some((t) => /Equipment \/ material/i.test(t)), false);
});

test("decision board priority reason uses snapshot comparison, not NLP", () => {
  const { project, insights } = disagreeingBundle();
  const previous = {
    health_score: 72,
    health_band: "watch",
    physical_progress: 42,
    financial_progress: 38,
    expenditure: 82,
    forecast_slippage_days: 12,
    overdue_critical: 0,
    overdue_milestones: 0,
    resources: { site_readiness: "ready", equipment: "ready", materials: "ready" },
    clearances: [],
  };
  const db = reviewsDb([{ id: 1, created_at: "2026-06-20", state_json: JSON.stringify(previous) }]);
  const rows = boardRowsFromProjects(db, [{ ...project, insights }]);
  assert.match(rows[0].priority_reason, /Site Readiness|site readiness/i);
  assert.doesNotMatch(rows[0].priority_reason, /Equipment \/ material supply/i);
  assert.equal(rows[0].primary_driver.field, "resources");
  assert.match(String(rows[0].primary_driver.to || rows[0].primary_driver.to_status || ""), /blocked/);
});

test("captureState stores deterministic bottleneck, not the NLP class", () => {
  const { project, insights } = disagreeingBundle();
  const state = captureState(project, insights);
  assert.match(state.bottleneck, /Site Readiness/i);
  assert.doesNotMatch(state.bottleneck, /Equipment \/ material supply/i);
});

test("QPISR bottleneck field is the deterministic driver; NLP is separate", () => {
  const { project, insights } = disagreeingBundle();
  const payload = qpisrPayload([{ ...project, insights }], { period: "Q2" });
  assert.match(payload.projects[0].bottleneck, /Site Readiness/i);
  assert.match(payload.projects[0].nlp_suggestion, /Equipment/i);
});

test("NLP suggestion remains available and is not written as a coded delay reason", () => {
  const { project, insights } = disagreeingBundle();
  assert.equal(project.delay_reason, null);
  assert.equal(insights.outlook.nlp_suggestion.category, "equipment");
  assert.equal(insights.outlook.primary_driver.category, "site_readiness");
});
