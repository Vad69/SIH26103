import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = path.join(os.tmpdir(), `sih26103-whatif-plfs-${Date.now()}.db`);
process.env.MONITOR_DB = tmp;

const { seedIfEmpty } = await import("./seed.js");
const { default: db, enrichProject } = await import("./db.js");
const { analyzeProject } = await import("./insights.js");
const { forecastProject } = await import("./forecast.js");
const { simulateScenario, intelInput } = await import("./decision.js");

test("seeded PLFS default officer-week scenario recalculates without mutating or hardcoding health", () => {
  seedIfEmpty();
  const row = db.prepare("SELECT * FROM projects WHERE name = ?").get("PLFS Digital Field Operations");
  assert.ok(row);
  const project = enrichProject(row);
  const before = {
    resources: JSON.stringify(project.resources),
    tasks: JSON.stringify(project.tasks),
    interventions: JSON.stringify(project.interventions),
  };
  const insightsCore = analyzeProject(intelInput(project));
  const forecast = forecastProject({
    project,
    insights: insightsCore,
    preconstructions: project.preconstructions || [],
    lifecycle_stages: project.lifecycle_stages || [],
    resources: project.resources || [],
  });
  const insights = { ...insightsCore, forecast };
  const liveScore = insights.health.score;

  const result = simulateScenario(project, insights, {
    resource_category: "site_readiness",
    resolve_in_days: 7,
    weekly_progress_pct: 8,
  });

  assert.equal(JSON.stringify(project.resources), before.resources);
  assert.equal(JSON.stringify(project.tasks), before.tasks);
  assert.equal(JSON.stringify(project.interventions), before.interventions);
  assert.equal(result.scenario_only, true);
  assert.equal(result.current.health_score, liveScore);
  assert.ok(
    result.delta.health_score !== 0 ||
      result.delta.forecast_slippage_days !== 0 ||
      result.delta.physical_progress !== 0,
    "scenario must change at least one calculated output"
  );
  assert.ok(result.recalc?.notes?.some((n) => /same rule-based engines/i.test(n)));
  if (result.delta.health_score === 0) {
    assert.ok(result.recalc.floor_factors.length);
  }

  const clone = JSON.parse(JSON.stringify(project));
  clone.resources.find((r) => r.category === "site_readiness").status = "ready";
  for (const t of clone.tasks || []) {
    t.progress = Math.max(0, Math.min(100, (t.progress || 0) + 8));
    if (t.progress >= 100) t.status = "done";
  }
  const analyzed = analyzeProject(intelInput(clone));
  assert.equal(result.scenario.health_score, analyzed.health.score);

  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(tmp + suffix);
    } catch {
      /* ignore */
    }
  }
});
