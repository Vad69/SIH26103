import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { api, getToken } from "../api.js";
import { Card, InsightBanner, ProgressBar, StatusPill, inputClass } from "../components/ui.jsx";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [meta, setMeta] = useState({ ministries: [], sectors: [], states: [] });
  const [filters, setFilters] = useState({ ministry: "", sector: "", state: "", health: "", status: "" });
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v) q.set(k, v);
    });
    const s = q.toString();
    return s ? `?${s}` : "";
  }, [filters]);

  useEffect(() => {
    api("/api/meta").then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    api(`/api/dashboard${query}`).then(setData).catch((e) => setError(e.message));
  }, [query]);

  async function exportCsv() {
    const res = await fetch("/api/export/projects.csv", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "projects.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="text-accent">{error}</p>;
  if (!data) return <p>Loading command center…</p>;

  const { stats, health } = data;
  const doughnut = {
    labels: ["On track", "Watch", "At risk", "Critical"],
    datasets: [
      {
        data: [health.on_track, health.watch, health.at_risk, health.critical],
        backgroundColor: ["#1f6f6a", "#8aa0b8", "#c45c26", "#7a1f1f"],
        borderWidth: 0,
      },
    ],
  };
  const delayBar = {
    labels: (data.delay_reasons || []).map((r) => r.label),
    datasets: [
      {
        label: "Projects",
        data: (data.delay_reasons || []).map((r) => r.count),
        backgroundColor: "#16345c",
        borderRadius: 6,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">MoSPI · SIH26103</p>
          <h2 className="font-serif mt-1 text-3xl">National monitoring command center</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Prototype decision-support using PAIMANA-aligned monitoring concepts (cost, time, milestones, delay reasons, interventions). Seeded projects are <strong>demo data</strong>. Indicators are calculated in this app — they are not official PAIMANA statistics.
          </p>
        </div>
        <button className="rounded-md border border-sand bg-white px-3 py-2 text-sm" type="button" onClick={exportCsv}>
          Export CSV
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        {[
          ["ministry", "Ministry", meta.ministries],
          ["sector", "Sector", meta.sectors],
          ["state", "State / UT", meta.states],
          ["health", "Health", ["on_track", "watch", "at_risk", "critical"]],
          ["status", "Status", ["planning", "active", "delayed", "on_hold", "completed"]],
        ].map(([key, label, opts]) => (
          <label key={key} className="text-sm">
            <span className="mb-1 block text-ink/50">{label}</span>
            <select className={inputClass} value={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.value })}>
              <option value="">All</option>
              {opts.map((o) => (
                <option key={o} value={o}>{String(o).replaceAll("_", " ")}</option>
              ))}
            </select>
          </label>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Projects", stats.total],
          ["Original cost", `₹${stats.original_cost} Cr`],
          ["Revised cost", `₹${stats.revised_cost} Cr`],
          ["Funds released", `₹${stats.funds_released ?? 0} Cr`],
          ["Expenditure", `₹${stats.expenditure} Cr`],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs tracking-wide text-ink/50 uppercase">{label}</p>
            <p className="mt-2 font-serif text-3xl">{value}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        {[
          ["On track", health.on_track, "on_track"],
          ["Watch", health.watch, "watch"],
          ["At risk", health.at_risk, "at_risk"],
          ["Critical", health.critical, "critical"],
        ].map(([label, value, status]) => (
          <Card key={label}>
            <p className="text-xs text-ink/50 uppercase">{label}</p>
            <div className="mt-2 flex items-center justify-between">
              <p className="font-serif text-3xl">{value}</p>
              <StatusPill status={status} />
            </div>
          </Card>
        ))}
      </div>

      {data.early_warnings?.[0] ? (
        <InsightBanner
          insight={{
            title: "Early warning",
            severity: "high",
            message: data.early_warnings[0].message,
          }}
        />
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-medium">Forecast schedule risk (prototype trajectory)</h3>
          <p className="mt-1 text-xs text-ink/50">Not a trained ML model. Complements current health.</p>
          <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
            <div><dt className="text-ink/50">High</dt><dd className="font-serif text-2xl">{data.forecast_risk?.high ?? 0}</dd></div>
            <div><dt className="text-ink/50">Medium</dt><dd className="font-serif text-2xl">{data.forecast_risk?.medium ?? 0}</dd></div>
            <div><dt className="text-ink/50">Low</dt><dd className="font-serif text-2xl">{data.forecast_risk?.low ?? 0}</dd></div>
          </dl>
        </Card>
        <Card>
          <h3 className="font-medium">Critical in-app alerts</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {(data.smart_alerts || []).slice(0, 5).map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2">
                <Link className="hover:underline" to={`/projects/${a.project_id}`}>{a.title}</Link>
                <StatusPill status={a.severity} />
              </li>
            ))}
            {!data.smart_alerts?.length ? <li className="text-ink/50">None for this filter.</li> : null}
          </ul>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-medium">Project health</h3>
          <div className="mx-auto mt-4 h-56 max-w-xs">
            <Doughnut data={doughnut} options={{ plugins: { legend: { position: "bottom" } } }} />
          </div>
        </Card>
        <Card>
          <h3 className="font-medium">Top delay reasons</h3>
          {data.delay_reasons?.length ? (
            <div className="mt-4 h-56">
              <Bar data={delayBar} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, indexAxis: "y" }} />
            </div>
          ) : (
            <p className="mt-4 text-sm text-ink/50">No delay reasons recorded yet.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-medium">Priority projects</h3>
          <ul className="mt-3 divide-y divide-sand">
            {(data.priority_projects || []).map((p, i) => (
              <li key={p.id} className="flex items-center justify-between py-2 text-sm">
                <Link className="font-medium hover:underline" to={`/projects/${p.id}`}>
                  {i + 1}. {p.name}
                </Link>
                <StatusPill status={p.band} />
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h3 className="font-medium">Issues & bottlenecks</h3>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-ink/50">Open</dt><dd className="font-serif text-2xl">{data.issues.open}</dd></div>
            <div><dt className="text-ink/50">Critical</dt><dd className="font-serif text-2xl">{data.issues.critical}</dd></div>
            <div><dt className="text-ink/50">Overdue</dt><dd className="font-serif text-2xl">{data.issues.overdue}</dd></div>
            <div><dt className="text-ink/50">Resolved</dt><dd className="font-serif text-2xl">{data.issues.resolved}</dd></div>
          </dl>
        </Card>
      </div>

      <Card>
        <h3 className="font-medium">Early warnings</h3>
        <ul className="mt-3 space-y-3">
          {(data.early_warnings || []).map((w) => (
            <li key={w.project_id} className="rounded-lg border border-sand p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link className="font-medium hover:underline" to={`/projects/${w.project_id}`}>{w.project_name}</Link>
                <StatusPill status={w.band} />
              </div>
              <p className="mt-1 text-sm">{w.message}</p>
              <ul className="mt-2 list-disc pl-5 text-sm text-ink/70">
                {w.reasons.map((r) => <li key={r.text}>{r.text}</li>)}
              </ul>
            </li>
          ))}
          {!data.early_warnings?.length ? <li className="text-sm text-ink/50">No early warnings in this filter.</li> : null}
        </ul>
      </Card>

      <Card>
        <h3 className="font-medium">Planned vs actual</h3>
        <div className="mt-3 space-y-3">
          {data.projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-lg border border-sand p-3 hover:bg-paper">
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="font-medium">{p.name}</span>
                <StatusPill status={p.health?.band} />
              </div>
              <p className="mb-2 text-xs text-ink/50">
                Planned (elapsed original timeline) {p.planned_progress}% · System-calculated (task average) {p.calculated_progress ?? p.progress}%
                {p.reported_physical_progress != null ? ` · Reported ${p.reported_physical_progress}%` : ""} · variance {p.progress - p.planned_progress}%
              </p>
              <ProgressBar value={p.progress} />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
