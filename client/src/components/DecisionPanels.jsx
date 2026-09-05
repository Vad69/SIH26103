import { useState } from "react";
import { api } from "../api.js";
import { Card, Field, ProgressBar, StatusPill, inputClass } from "./ui.jsx";

function changeLine(c) {
  const from = Array.isArray(c.from) ? c.from.join(", ") || "—" : c.from;
  const to = Array.isArray(c.to) ? c.to.join(", ") || "—" : c.to;
  return `${c.label || c.field}: ${from} → ${to}`;
}

function Retry({ onRetry }) {
  if (!onRetry) return null;
  return (
    <button type="button" className="mt-2 text-sm text-navy underline" onClick={onRetry}>
      Try again
    </button>
  );
}

export function HealthExplainPanel({ health, forecast }) {
  if (!health) return null;
  const rows = health.factor_rows || [];
  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">Rule-based health analysis</p>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-serif text-4xl">{health.score} <span className="text-lg text-ink/50">/ 100</span></p>
          <p className="mt-1 text-sm">
            <StatusPill status={health.band} />
            <span className="ml-2 text-ink/60">Not an ML prediction</span>
          </p>
        </div>
        <div className="max-w-md text-xs text-ink/60">
          <p><span className="font-medium text-ink/80">Observed / analysis: </span>score from the five existing factors.</p>
          <p className="mt-1"><span className="font-medium text-ink/80">Forecast: </span>prototype slippage {forecast?.estimated_slippage_days ?? "—"} days (not a guaranteed date).</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-5">
        {rows.map((row) => (
          <div key={row.label}>
            <p className="text-xs text-ink/50">{row.label}</p>
            <p className="text-sm font-medium">{row.score} / 100</p>
            <ProgressBar value={row.score} />
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-ink/50">{health.band_explanation}</p>
    </Card>
  );
}

export function WhatChangedPanel({ data, loading, error, onRetry }) {
  if (loading) return <Card><p className="text-sm text-ink/50">Comparing with the previous review…</p></Card>;
  if (error) {
    return (
      <Card>
        <p className="text-sm text-accent">{error}</p>
        <Retry onRetry={onRetry} />
      </Card>
    );
  }
  if (!data) return null;
  if (!data.available) {
    return (
      <Card>
        <p className="text-xs uppercase text-ink/50">What changed?</p>
        <h3 className="font-medium mt-1">No previous review is available for comparison.</h3>
        <p className="mt-2 text-sm text-ink/65">
          After the next officer update, PRAGATI will store a snapshot and compare it with this state.
        </p>
      </Card>
    );
  }
  const healthDelta = data.health_delta;
  const driverKind = data.driver_kind || data.recommended_intervention?.driver_kind;
  const driverTitle = driverKind === "likely_driver" ? "Likely driver" : driverKind === "forecast" ? "Forecast driver" : "Primary driver (observed)";
  const observed = (data.changes || []).filter((c) => (c.evidence || "observed") === "observed");
  const analysis = (data.changes || []).filter((c) => c.evidence === "analysis");
  const forecast = (data.changes || []).filter((c) => c.evidence === "forecast");
  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">What changed?</p>
      <p className="mt-1 text-xs text-ink/50">
        Compared with the last distinct review ({data.previous_at ? new Date(data.previous_at).toLocaleDateString() : "prior snapshot"}).
      </p>
      <div className="mt-3">
        <p className="text-xs text-ink/50">Project health (rule-based)</p>
        <p className="font-serif text-3xl">
          {data.previous?.health_score} → {data.current?.health_score}
        </p>
        <p className={`text-sm font-medium ${healthDelta < 0 ? "text-accent" : healthDelta > 0 ? "text-teal" : "text-ink/60"}`}>
          {healthDelta > 0 ? "↑" : healthDelta < 0 ? "↓" : "→"} {healthDelta > 0 ? "+" : ""}{healthDelta} points
          {" · "}
          {data.previous?.health_band} → {data.current?.health_band}
        </p>
      </div>
      <div className="mt-4 space-y-3 text-sm">
        <div>
          <p className="text-xs uppercase text-ink/50">Key changes — observed</p>
          <ul className="mt-1 space-y-1">
            {observed.map((c, i) => (
              <li key={`o-${c.field}-${c.category || i}`}>
                <span className="font-medium">{c.direction === "worse" ? "Deterioration" : c.direction === "better" ? "Improvement" : "Change"} · </span>
                {changeLine(c)}
                <span className="text-ink/45"> · Observed</span>
              </li>
            ))}
            {!observed.length ? <li className="text-ink/50">No additional observed field changes.</li> : null}
          </ul>
        </div>
        {analysis.length ? (
          <div>
            <p className="text-xs uppercase text-ink/50">Rule-based health</p>
            <ul className="mt-1 space-y-1">
              {analysis.map((c, i) => (
                <li key={`a-${c.field}-${i}`}>{changeLine(c)} <span className="text-ink/45">· Analysis</span></li>
              ))}
            </ul>
          </div>
        ) : null}
        {forecast.length ? (
          <div>
            <p className="text-xs uppercase text-ink/50">Forecast</p>
            <ul className="mt-1 space-y-1">
              {forecast.map((c, i) => (
                <li key={`f-${c.field}-${i}`}>{changeLine(c)} <span className="text-ink/45">· Prototype trajectory, not a guaranteed date</span></li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
      {data.primary_driver ? (
        <div className="mt-4 rounded-lg bg-paper p-3 text-sm">
          <p className="text-xs uppercase text-ink/50">{driverTitle}</p>
          <p className="mt-1 font-medium">{data.primary_driver.label || data.primary_driver.field}</p>
          <p className="text-ink/65">{changeLine(data.primary_driver)}</p>
          <p className="mt-2"><span className="text-ink/50">Why it matters: </span>{data.why_it_matters || data.recommended_intervention?.why_it_matters}</p>
        </div>
      ) : null}
      {data.recommended_intervention ? (
        <div className="mt-3 text-sm">
          <p className="text-xs uppercase text-ink/50">Recommended action</p>
          <p className="mt-1 font-medium">{data.recommended_intervention.action}</p>
        </div>
      ) : null}
    </Card>
  );
}

export function WhatIfPanel({ projectId, canRun, onError }) {
  const [form, setForm] = useState({
    resource_category: "materials",
    resolve_in_days: "7",
    weekly_progress_pct: "",
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");

  async function run(e) {
    e.preventDefault();
    setBusy(true);
    setLocalError("");
    const body = { resource_category: form.resource_category };
    if (form.resolve_in_days !== "") body.resolve_in_days = Number(form.resolve_in_days);
    if (form.weekly_progress_pct !== "") body.weekly_progress_pct = Number(form.weekly_progress_pct);
    try {
      const data = await api(`/api/projects/${projectId}/what-if`, { method: "POST", body: JSON.stringify(body) });
      setResult(data);
    } catch (err) {
      setLocalError(err.message || "Scenario could not be calculated from the available project data.");
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  const cat = form.resource_category;
  const currentRes = result?.current?.resources?.find((r) => r.category === cat);
  const scenarioRes = result?.scenario?.resources?.find((r) => r.category === cat);

  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">What-if analysis</p>
      <h3 className="font-medium mt-1">Scenario simulation</h3>
      <p className="mt-1 text-xs text-ink/50">
        Scenario only. The live project is not modified. Uses the same health and forecast rules as monitoring — not a guaranteed prediction.
      </p>
      <form className="mt-3 grid gap-3 md:grid-cols-3" onSubmit={run}>
        <Field label="Resource">
          <select className={inputClass} value={form.resource_category} onChange={(e) => setForm({ ...form, resource_category: e.target.value })}>
            <option value="materials">Materials</option>
            <option value="equipment">Equipment</option>
            <option value="human_resources">Human resources</option>
            <option value="logistics">Logistics</option>
            <option value="site_readiness">Site readiness</option>
          </select>
        </Field>
        <Field label="Restored within (days)">
          <input className={inputClass} type="number" min="0" value={form.resolve_in_days} onChange={(e) => setForm({ ...form, resolve_in_days: e.target.value })} />
        </Field>
        <Field label="Physical progress +% / week (optional)">
          <input className={inputClass} type="number" value={form.weekly_progress_pct} onChange={(e) => setForm({ ...form, weekly_progress_pct: e.target.value })} />
        </Field>
        <button className="rounded-md bg-navy px-4 py-2 text-sm text-white md:col-span-3 disabled:opacity-50" type="submit" disabled={!canRun || busy}>
          {busy ? "Simulating…" : "Run simulation"}
        </button>
      </form>
      {localError ? <p className="mt-2 text-sm text-accent">{localError}</p> : null}
      {result ? (
        <div className="mt-4 space-y-3">
          <p className="rounded-md bg-paper px-3 py-2 text-xs font-medium">Scenario only. The live project is not modified.</p>
          <div className="grid gap-4 sm:grid-cols-2 text-sm">
            <div className="rounded-lg border border-sand p-3">
              <p className="text-xs uppercase text-ink/50">Current state</p>
              <p className="mt-2">Health {result.current.health_score} · {String(result.current.health_band || "").replaceAll("_", " ")}</p>
              <p>Material / selected readiness: <strong>{currentRes?.status || "—"}</strong></p>
              <p>Projected delay: <strong>{result.current.forecast_slippage_days} days</strong> <span className="text-ink/45">(forecast)</span></p>
              <p>Estimated completion: {result.current.forecast_finish || "—"}</p>
              <p>Physical progress: {result.current.physical_progress}%</p>
            </div>
            <div className="rounded-lg border border-navy/20 bg-navy/5 p-3">
              <p className="text-xs uppercase text-ink/50">Scenario</p>
              <p className="mt-2">Health {result.scenario.health_score} · {String(result.scenario.health_band || "").replaceAll("_", " ")}</p>
              <p>Selected readiness: <strong>{scenarioRes?.status || "—"}</strong></p>
              <p>Projected delay: <strong>{result.scenario.forecast_slippage_days} days</strong></p>
              <p>Estimated completion: {result.scenario.forecast_finish || "—"}</p>
              <p>Physical progress: {result.scenario.physical_progress}%</p>
              <p className="mt-2 font-medium">
                Expected difference: {result.delta.expected_recovery_days} days
                {result.delta.health_score ? ` · health ${result.delta.health_score > 0 ? "+" : ""}${result.delta.health_score}` : ""}
              </p>
            </div>
          </div>
          <div>
            <p className="text-xs uppercase text-ink/50">Assumptions</p>
            <ul className="mt-1 list-disc pl-5 text-xs text-ink/65">
              {(result.assumptions || [result.disclaimer]).map((a) => <li key={a}>{a}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
    </Card>
  );
}

const LANE_LABEL = {
  event: "Event",
  consequence: "Consequence",
  response: "Response",
  outcome: "Outcome",
};

export function DecisionTimelinePanel({ events, loading, error, onRetry, disclaimer }) {
  if (loading) return <Card><p className="text-sm text-ink/50">Loading decision timeline…</p></Card>;
  if (error) {
    return (
      <Card>
        <p className="text-sm text-accent">{error}</p>
        <Retry onRetry={onRetry} />
      </Card>
    );
  }
  const list = events || [];
  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">Decision timeline</p>
      <p className="mt-1 text-xs text-ink/50">{disclaimer || "Event → consequence → response → outcome. Gantt bars remain on the Timeline tab."}</p>
      <ol className="mt-4 space-y-3">
        {list.map((ev, i) => (
          <li key={`${ev.at}-${ev.type}-${i}`} className="border-l-2 border-sand pl-4">
            <p className="text-xs text-ink/45">
              {ev.at ? new Date(ev.at).toLocaleDateString() : ""} · {LANE_LABEL[ev.lane] || "Event"}
            </p>
            <p className="font-medium text-sm">{ev.title}</p>
            {ev.detail ? <p className="text-sm text-ink/65">{ev.detail}</p> : null}
            {ev.trigger_summary ? <p className="text-xs text-ink/50">Trigger: {ev.trigger_summary}</p> : null}
          </li>
        ))}
        {!list.length ? <li className="text-sm text-ink/50">No decision events yet. Lifecycle dates, reviews, and interventions will appear here.</li> : null}
      </ol>
    </Card>
  );
}

export function CreateInterventionFromRecommendation({ projectId, recommendation, canManage, onSaved, onError }) {
  const [form, setForm] = useState({
    assigned_officer: "Project Manager",
    due_date: "",
    priority: "high",
    actual_action: "",
  });
  const [busy, setBusy] = useState(false);
  if (!canManage || !recommendation) return null;
  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">Officer action</p>
      <h3 className="font-medium mt-1">Create intervention from recommendation</h3>
      <form
        className="mt-3 grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          api(`/api/projects/${projectId}/interventions`, {
            method: "POST",
            body: JSON.stringify({
              action: form.actual_action || recommendation.action,
              recommended_action: recommendation.action,
              actual_action: form.actual_action || recommendation.action,
              trigger_summary: recommendation.why,
              assigned_officer: form.assigned_officer,
              due_date: form.due_date || undefined,
              priority: form.priority,
              status: "open",
            }),
          })
            .then(() => onSaved?.())
            .catch((err) => onError?.(err.message))
            .finally(() => setBusy(false));
        }}
      >
        <div className="md:col-span-2 text-sm text-ink/70 space-y-1">
          <p><span className="text-ink/50">Trigger: </span>{recommendation.why}</p>
          <p><span className="text-ink/50">Recommended action: </span>{recommendation.action}</p>
        </div>
        <Field label="Officer action (what you will actually do)">
          <input className={inputClass} value={form.actual_action} placeholder={recommendation.action} onChange={(e) => setForm({ ...form, actual_action: e.target.value })} />
        </Field>
        <Field label="Owner"><input className={inputClass} value={form.assigned_officer} onChange={(e) => setForm({ ...form, assigned_officer: e.target.value })} /></Field>
        <Field label="Due date"><input type="date" className={inputClass} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
        <button className="rounded-md bg-navy px-4 py-2 text-sm text-white disabled:opacity-50" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Create intervention"}
        </button>
      </form>
    </Card>
  );
}
