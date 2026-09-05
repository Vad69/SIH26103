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

function Movement({ movement }) {
  if (!movement) {
    return <p className="text-sm text-ink/50">Portfolio movement appears after projects have a previous review.</p>;
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
              {m.delta > 0 ? "↑" : m.delta < 0 ? "↓" : "·"}
            </span>
          </p>
        </div>
      ))}
    </div>
  );
}

function trendMark(trend) {
  if (trend === "worse") return "↓";
  if (trend === "better") return "↑";
  if (trend === "stable") return "→";
  return "·";
}

export default function DecisionBoard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/decision-board").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-accent">{error}</p>;
  if (!data) return <p>Loading decision board…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Executive view</p>
        <h2 className="font-serif mt-1 text-3xl">Decision board</h2>
        <p className="mt-2 max-w-3xl text-sm text-ink/65">
          Which projects require attention today, and why. Ranking uses live five-factor health, the prototype forecast, and review-to-review change — not a machine-learning model.
        </p>
      </div>

      <Card>
        <p className="text-xs uppercase text-ink/50">Portfolio movement</p>
        <div className="mt-3">
          <Movement movement={data.movement} />
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
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <StatusPill status={p.health_band} />
                        <span>Health {p.health_score} {trendMark(p.trend)}</span>
                        <span>Projected delay {p.forecast_slippage_days ?? "—"} days</span>
                      </div>
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div><dt className="text-ink/50">Primary bottleneck</dt><dd>{p.bottleneck || "—"}</dd></div>
                    <div><dt className="text-ink/50">Most important recent change</dt><dd>{p.recent_change}</dd></div>
                    <div className="sm:col-span-2"><dt className="text-ink/50">Recommended action</dt><dd>{p.recommended_action}</dd></div>
                  </dl>
                </Card>
              ))}
              {!items.length ? <p className="text-sm text-ink/50">None in this group.</p> : null}
            </div>
          </section>
        );
      })}
      <p className="text-xs text-ink/45">{data.disclaimer}</p>
    </div>
  );
}
