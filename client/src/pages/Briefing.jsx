import { useEffect, useState } from "react";
import { api } from "../api.js";
import { Card, StatusPill } from "../components/ui.jsx";

export default function Briefing() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/briefing").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-accent">{error}</p>;
  if (!data) return <p>Compiling monthly brief…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Review</p>
          <h2 className="font-serif mt-1 text-3xl">Monthly monitoring brief</h2>
          <p className="mt-2 text-sm text-ink/60">Deterministic brief from the live database — the same family of artefact as MoSPI flash / review reports.</p>
        </div>
        <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="button" onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>
      <Card>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-6">{data.narrative}</pre>
      </Card>
      <Card>
        <h3 className="font-medium">Open interventions</h3>
        <ul className="mt-3 divide-y divide-sand text-sm">
          {data.top_interventions.map((iv) => (
            <li key={iv.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>{iv.action}</span>
              <StatusPill status={iv.status} />
            </li>
          ))}
          {!data.top_interventions.length ? <li className="py-2 text-ink/50">None open.</li> : null}
        </ul>
      </Card>
    </div>
  );
}
