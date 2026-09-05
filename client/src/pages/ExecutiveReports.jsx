import { useEffect, useState } from "react";
import { api, getToken } from "../api.js";
import { Card, StatusPill } from "../components/ui.jsx";

export default function ExecutiveReports({ kind }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const path = kind === "qpisr" ? "/api/reports/qpisr" : "/api/reports/flash";
  const pdf = kind === "qpisr" ? "/api/reports/qpisr.pdf" : "/api/reports/flash.pdf";
  const title = kind === "qpisr" ? "QPISR-style quarterly status" : "Monthly flash report";

  useEffect(() => {
    setData(null);
    api(path).then(setData).catch((e) => setError(e.message));
  }, [path]);

  async function download() {
    const res = await fetch(pdf, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = kind === "qpisr" ? "pragati-qpisr.pdf" : "pragati-flash.pdf";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <p className="text-accent">{error}</p>;
  if (!data) return <p>Compiling report…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Executive</p>
          <h2 className="font-serif mt-1 text-3xl">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">{data.disclaimer}</p>
        </div>
        <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="button" onClick={download}>
          Download PDF
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Card><p className="text-xs text-ink/50 uppercase">Period</p><p className="mt-1">{data.period}</p></Card>
        <Card><p className="text-xs text-ink/50 uppercase">Projects</p><p className="font-serif text-3xl">{data.total_projects}</p></Card>
        <Card><p className="text-xs text-ink/50 uppercase">Attention</p><p className="font-serif text-3xl">{data.requiring_attention}</p></Card>
        <Card><p className="text-xs text-ink/50 uppercase">Critical</p><p className="font-serif text-3xl">{data.critical_projects}</p></Card>
      </div>
      <Card>
        <h3 className="font-medium">Movement</h3>
        <p className="mt-2 text-sm">Newly at risk: {(data.newly_risk || []).join(", ") || "None"}</p>
        <p className="text-sm">Improving: {(data.improving || []).join(", ") || "None"}</p>
        <p className="text-sm">Deteriorating: {(data.deteriorating || []).join(", ") || "None"}</p>
        <p className="mt-2 text-sm">High forecast schedule risk: {(data.high_forecast || []).join(", ") || "None"}</p>
      </Card>
      <Card>
        <h3 className="font-medium">Delay / NLP-assisted bottleneck counts</h3>
        <ul className="mt-2 text-sm">
          {(data.nlp_bottlenecks || data.major_delay_reasons || []).map((r) => (
            <li key={r.id || r.label}>{r.label}: {r.count}</li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="font-medium">Portfolio table</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-xs uppercase text-ink/50">
              <tr>
                <th className="py-2">Project</th>
                <th>Health</th>
                <th>Forecast</th>
                <th>Progress</th>
                <th>Sanctioned</th>
                <th>Released</th>
                <th>Exp.</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id} className="border-t border-sand">
                  <td className="py-2">{p.name}</td>
                  <td><StatusPill status={p.health} /></td>
                  <td>{p.forecast_risk}</td>
                  <td>{p.physical_progress ?? p.calculated_progress}%</td>
                  <td>₹{p.sanctioned ?? p.original_cost} Cr</td>
                  <td>₹{p.funds_released} Cr</td>
                  <td>₹{p.expenditure} Cr</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card>
        <h3 className="font-medium">Pre-construction blockers</h3>
        <ul className="mt-2 list-disc pl-5 text-sm">
          {(data.precon_blockers || []).map((b) => <li key={b}>{b}</li>)}
          {!data.precon_blockers?.length ? <li className="list-none text-ink/50">None recorded</li> : null}
        </ul>
      </Card>
    </div>
  );
}
