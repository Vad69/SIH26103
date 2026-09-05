import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Card, StatusPill } from "../components/ui.jsx";

const GROUP_META = [
  { key: "immediate", title: "Requires immediate attention" },
  { key: "at_risk", title: "At risk" },
  { key: "improving", title: "Improving" },
  { key: "on_track", title: "On track" },
];

function trendWords(trend) {
  if (trend === "worse") return "Deteriorating";
  if (trend === "better") return "Improving";
  if (trend === "stable") return "Stable";
  return "No prior review";
}

function Movement({ movement, available }) {
  if (!available || !movement) {
    return <p className="text-sm text-ink/50">Historical portfolio comparison unavailable.</p>;
  }
  const rows = [
    ["Critical", movement.critical],
    ["At risk", movement.at_risk],
    ["Watch", movement.watch],
    ["On track", movement.on_track],
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      {rows.map(([label, m]) => (
        <div key={label} className="rounded-lg border border-sand px-3 py-2 text-sm">
          <p className="text-xs text-ink/50">{label}</p>
          <p className="font-medium">
            {m.from} → {m.to}{" "}
            <span className={m.delta > 0 ? "text-accent" : m.delta < 0 ? "text-teal" : "text-ink/50"}>
              {m.delta > 0 ? "up" : m.delta < 0 ? "down" : "unchanged"}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}

export function TodaySummary({ data }) {
  if (!data) return null;
  const s = data.summary || {};
  return (
    <Card>
      <p className="text-xs uppercase text-ink/50">Today&apos;s project portfolio</p>
      <ul className="mt-3 space-y-1 text-sm">
        <li>{s.immediate ?? 0} project{(s.immediate || 0) === 1 ? "" : "s"} require immediate attention</li>
        {s.deteriorated != null ? <li>{s.deteriorated} project{(s.deteriorated || 0) === 1 ? "" : "s"} deteriorated since last review</li> : <li className="text-ink/50">Historical comparison unavailable for deterioration counts.</li>}
        <li>{s.improving ?? 0} project{(s.improving || 0) === 1 ? "" : "s"} are improving</li>
        <li>{s.on_track ?? 0} on track (including stable watch)</li>
      </ul>
      {(data.insights || []).length ? (
        <ul className="mt-3 list-disc pl-5 text-sm text-ink/70">
          {data.insights.map((line) => <li key={line}>{line}</li>)}
        </ul>
      ) : null}
      <p className="mt-3 text-xs text-ink/45">{data.disclaimer}</p>
    </Card>
  );
}

export default function DecisionBoard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError("");
    api("/api/decision-board")
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  if (error) {
    return (
      <div>
        <p className="text-accent">{error}</p>
        <button type="button" className="mt-2 text-sm text-navy underline" onClick={load}>Try again</button>
      </div>
    );
  }
  if (loading || !data) return <p>Loading decision board…</p>;

  const s = data.summary || {};

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Executive view</p>
        <h2 className="font-serif mt-1 text-3xl">Which projects require my attention?</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink/65">
          Management view: which projects to look at first, and why. Health is rule-based; slippage is a prototype forecast, not a guaranteed date. Open a row, then Outlook for What changed / What-if, Interventions to record action, Decisions for history.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Total projects", s.total],
          ["Requires attention", s.requires_attention],
          ["Improving", s.improving],
          ["On track", s.on_track],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs uppercase text-ink/50">{label}</p>
            <p className="font-serif mt-1 text-3xl">{value ?? "—"}</p>
          </Card>
        ))}
      </div>

      <TodaySummary data={data} />

      <Card>
        <p className="text-xs uppercase text-ink/50">Portfolio movement</p>
        <div className="mt-3">
          <Movement movement={data.movement} available={data.movement_available} />
        </div>
      </Card>

      {GROUP_META.map((g) => {
        const items = data.groups?.[g.key] || [];
        return (
          <section key={g.key}>
            <h3 className="font-medium">{g.title}</h3>
            <div className="mt-3 grid gap-3">
              {items.map((p) => (
                <Card key={p.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <Link to={`/projects/${p.id}`} className="font-medium hover:underline">{p.name}</Link>
                      <p className="text-xs text-ink/45">Opens on Outlook (health, What changed, What-if)</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <StatusPill status={p.health_band} />
                        <span>Health {p.health_score} ({trendWords(p.trend)})</span>
                        <span>Projected slippage {p.forecast_slippage_days ?? "—"} days{p.forecast_risk ? ` · ${p.forecast_risk} forecast risk` : ""}</span>
                      </div>
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-ink/50">Priority reason</dt><dd>{p.priority_reason || "—"}</dd></div>
                    <div><dt className="text-ink/50">Primary issue</dt><dd>{p.bottleneck || p.primary_driver?.label || "—"}</dd></div>
                    <div><dt className="text-ink/50">Recent change</dt><dd>{p.recent_change}</dd></div>
                    <div><dt className="text-ink/50">Recommended action</dt><dd>{p.recommended_action}</dd></div>
                  </dl>
                </Card>
              ))}
              {!items.length ? <p className="text-sm text-ink/50">None in this group.</p> : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}
