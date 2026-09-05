import { useState } from "react";
import { api } from "../api.js";
import { Card, Field, inputClass } from "./ui.jsx";

function tone(direction) {
  if (direction === "worse") return "text-accent";
  if (direction === "better") return "text-teal";
  return "text-ink/70";
}

function changeLine(c) {
  const from = Array.isArray(c.from) ? c.from.join(", ") || "—" : c.from;
  const to = Array.isArray(c.to) ? c.to.join(", ") || "—" : c.to;
  return `${c.label || c.field}: ${from} → ${to}`;
}

export function WhatChangedPanel({ data, loading, error }) {
  if (loading) return <Card><p className="text-sm text-ink/50">Comparing with the previous review…</p></Card>;
  if (error) return <Card><p className="text-sm text-accent">{error}</p></Card>;
  if (!data) return null;
  if (!data.available) {
    return (
      <Card>
        <p className="text-xs uppercase text-ink/50">What changed?</p>
        <h3 className="font-medium mt-1">No previous review</h3>
        <p className="mt-2 text-sm text-ink/65">
          PRAGATI will compare the next meaningful state change with this review. Record a review after an officer update to start the trail.
        </p>
      </Card>
    );
  }
  const healthDelta = data.health_delta;
  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">What changed?</p>
      <p className="mt-1 text-xs text-ink/50">Compared with the last distinct review ({data.previous_at ? new Date(data.previous_at).toLocaleDateString() : "prior snapshot"}).</p>
      <div className="mt-3 flex flex-wrap items-end gap-6">
        <div>
          <p className="text-xs text-ink/50">Project health</p>
          <p className="font-serif text-3xl">
            {data.previous?.health_score} → {data.current?.health_score}
          </p>
          <p className={`text-sm font-medium ${healthDelta < 0 ? "text-accent" : healthDelta > 0 ? "text-teal" : "text-ink/60"}`}>
            {healthDelta > 0 ? "+" : ""}{healthDelta} points · {data.previous?.health_band} → {data.current?.health_band}
          </p>
        </div>
        {data.primary_driver ? (
          <div>
            <p className="text-xs text-ink/50">Primary driver (from observed change)</p>
            <p className="font-medium">{data.primary_driver.label || data.primary_driver.field}</p>
            <p className="text-sm text-ink/65">{changeLine(data.primary_driver)}</p>
          </div>
        ) : null}
      </div>
      <ul className="mt-4 space-y-2 text-sm">
        {(data.changes || []).map((c, i) => (
          <li key={`${c.field}-${c.category || i}`} className={tone(c.direction)}>
            {c.direction === "worse" ? "● " : c.direction === "better" ? "○ " : "· "}
            {changeLine(c)}
            {c.delta != null ? ` (${c.delta > 0 ? "+" : ""}${c.delta})` : ""}
          </li>
        ))}
        {!data.changes?.length ? <li className="text-ink/50">No field-level change versus the previous distinct review.</li> : null}
      </ul>
      {data.recommended_intervention ? (
        <div className="mt-4 rounded-lg bg-paper p-3 text-sm">
          <p className="text-xs uppercase text-ink/50">Recommended intervention</p>
          <p className="mt-1 font-medium">{data.recommended_intervention.action}</p>
          <p className="mt-1 text-ink/65">{data.recommended_intervention.why}</p>
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
      setLocalError(err.message);
      onError?.(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">What-if analysis</p>
      <h3 className="font-medium mt-1">Scenario simulation</h3>
      <p className="mt-1 text-xs text-ink/50">
        Uses the same health and forecast rules as live monitoring. This does not change the stored project unless you save an intervention or an officer update.
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
        <Field label="Resolved within (days)">
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
        <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
          <div className="rounded-lg border border-sand p-3">
            <p className="text-xs uppercase text-ink/50">Current state</p>
            <p className="mt-2">Health {result.current.health_score} · {result.current.health_band}</p>
            <p>Projected delay: <strong>{result.current.forecast_slippage_days} days</strong></p>
            <p>Physical progress: {result.current.physical_progress}%</p>
          </div>
          <div className="rounded-lg border border-navy/20 bg-navy/5 p-3">
            <p className="text-xs uppercase text-ink/50">Scenario</p>
            <p className="mt-2">Health {result.scenario.health_score} · {result.scenario.health_band}</p>
            <p>Projected delay: <strong>{result.scenario.forecast_slippage_days} days</strong></p>
            <p>Physical progress: {result.scenario.physical_progress}%</p>
            <p className="mt-2 font-medium">
              Expected recovery: {result.delta.expected_recovery_days} days
            </p>
          </div>
          <p className="sm:col-span-2 text-xs text-ink/50">{result.disclaimer}</p>
        </div>
      ) : null}
    </Card>
  );
}

export function DecisionTimelinePanel({ events, loading, error }) {
  if (loading) return <Card><p className="text-sm text-ink/50">Loading decision timeline…</p></Card>;
  if (error) return <Card><p className="text-sm text-accent">{error}</p></Card>;
  const list = events || [];
  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">Decision timeline</p>
      <p className="mt-1 text-xs text-ink/50">Event → consequence → response → outcome, in chronological order. Gantt bars remain on the Timeline tab.</p>
      <ol className="mt-4 space-y-3">
        {list.map((ev, i) => (
          <li key={`${ev.at}-${ev.type}-${i}`} className="border-l-2 border-sand pl-4">
            <p className="text-xs text-ink/45">{ev.at ? new Date(ev.at).toLocaleDateString() : ""}</p>
            <p className="font-medium text-sm">{ev.title}</p>
            {ev.detail ? <p className="text-sm text-ink/65">{ev.detail}</p> : null}
            {ev.trigger_summary ? <p className="text-xs text-ink/50">Why: {ev.trigger_summary}</p> : null}
          </li>
        ))}
        {!list.length ? <li className="text-sm text-ink/50">No timeline events yet.</li> : null}
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
  if (!canManage || !recommendation) return null;
  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">Officer action</p>
      <h3 className="font-medium mt-1">Create intervention from recommendation</h3>
      <form
        className="mt-3 grid gap-3 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
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
            .catch((err) => onError?.(err.message));
        }}
      >
        <div className="md:col-span-2 text-sm text-ink/70">
          <p><span className="text-ink/50">Recommended: </span>{recommendation.action}</p>
          <p className="mt-1"><span className="text-ink/50">Why: </span>{recommendation.why}</p>
        </div>
        <Field label="Actual action"><input className={inputClass} value={form.actual_action} placeholder={recommendation.action} onChange={(e) => setForm({ ...form, actual_action: e.target.value })} /></Field>
        <Field label="Owner"><input className={inputClass} value={form.assigned_officer} onChange={(e) => setForm({ ...form, assigned_officer: e.target.value })} /></Field>
        <Field label="Due date"><input type="date" className={inputClass} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </Field>
        <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Create intervention</button>
      </form>
    </Card>
  );
}
