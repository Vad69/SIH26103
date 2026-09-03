import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Card, StatusPill } from "../components/ui.jsx";

export default function Alerts() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  function load() {
    api("/api/alerts").then(setRows).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  if (error) return <p className="text-accent">{error}</p>;
  if (!rows) return <p>Loading alerts…</p>;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">In-app</p>
        <h2 className="font-serif mt-1 text-3xl">Smart alerts</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Generated from the existing early-warning engine plus forecast and pre-construction blockers. Not email or SMS. Scoped to projects you can see.
        </p>
      </div>
      {rows.map((a) => (
        <Card key={a.id} className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link className="font-medium hover:underline" to={`/projects/${a.project_id}`}>
              {a.title}
            </Link>
            <p className="mt-1 text-sm text-ink/70">{a.explanation}</p>
            <p className="mt-1 text-xs text-ink/40">{new Date(a.created_at).toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill status={a.severity} />
            {a.read_at ? (
              <span className="text-xs text-ink/40">Read</span>
            ) : (
              <button
                className="text-sm text-navy hover:underline"
                type="button"
                onClick={() => api(`/api/alerts/${a.id}/read`, { method: "POST", body: JSON.stringify({}) }).then(load)}
              >
                Mark read
              </button>
            )}
          </div>
        </Card>
      ))}
      {!rows.length ? <p className="text-sm text-ink/50">No alerts in your current workspace.</p> : null}
    </div>
  );
}
