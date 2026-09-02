import { useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Card } from "../components/ui.jsx";

const SAMPLE = `code,name,ministry,sector,state,original_cost,revised_cost,expenditure,start_date,original_end_date,revised_end_date
NH-EX-01,Eastern Peripheral Expressway Package,Ministry of Road Transport and Highways,Roads & Highways,Uttar Pradesh,1250,1480,820,2024-04-01,2027-06-30,2027-12-31
`;

export default function ImportPage() {
  const { user } = useAuth();
  const [csv, setCsv] = useState(SAMPLE);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  if (user.role !== "admin") return <Navigate to="/" replace />;

  async function scan(e) {
    e.preventDefault();
    setError("");
    try {
      const data = await api("/api/import/projects", { method: "POST", body: JSON.stringify({ csv, commit: false }) });
      setPreview(data);
      setResult(null);
    } catch (err) {
      setError(err.message);
    }
  }

  async function commit() {
    setError("");
    try {
      const data = await api("/api/import/projects", { method: "POST", body: JSON.stringify({ csv, commit: true }) });
      setResult(data);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Admin</p>
        <h2 className="font-serif mt-1 text-3xl">Import project data</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Paste CSV (Excel can save as CSV). Preview first, then import. This is how a department would load a PAIMANA-style extract rather than typing 1,900 rows.
        </p>
      </div>
      <Card>
        <form onSubmit={scan} className="space-y-3">
          <textarea className="h-48 w-full rounded-md border border-sand bg-paper p-3 font-mono text-xs" value={csv} onChange={(e) => setCsv(e.target.value)} />
          {error ? <p className="text-sm text-accent">{error}</p> : null}
          <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Preview</button>
        </form>
      </Card>
      {preview ? (
        <Card>
          <p className="text-sm">{preview.detected} records · {preview.valid} valid · {preview.flagged} need correction</p>
          <ul className="mt-3 max-h-48 overflow-auto text-sm">
            {preview.preview.map((p, i) => (
              <li key={i}>{p.ok ? "✓" : "⚠"} {p.name}</li>
            ))}
          </ul>
          <button className="mt-4 rounded-md bg-teal px-4 py-2 text-sm text-white" type="button" onClick={commit}>
            Import valid rows
          </button>
          {result ? <p className="mt-2 text-sm">Imported {result.imported}.</p> : null}
        </Card>
      ) : null}
    </div>
  );
}
