import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Card, Field, ProgressBar, StatusPill, inputClass } from "../components/ui.jsx";

const empty = {
  name: "",
  description: "",
  start_date: "",
  end_date: "",
  status: "planning",
  ministry: "",
  sector: "",
  state: "",
  original_cost: "",
  revised_cost: "",
  expenditure: "",
};

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const canCreate = user.role === "admin" || user.role === "project_manager";

  function load() {
    api("/api/projects").then(setProjects).catch((e) => setError(e.message));
  }

  useEffect(load, []);

  async function create(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/api/projects", { method: "POST", body: JSON.stringify(form) });
      setForm(empty);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!projects && !error) return <p>Loading projects…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Portfolio</p>
          <h2 className="font-serif mt-1 text-3xl">Projects</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Progress bars use system-calculated task averages, not official ministry-reported physical progress.
            {user.role === "admin"
              ? " Projects you create here are assigned to you as manager, so a Project Manager cannot edit them."
              : user.role === "project_manager"
                ? " You can edit only projects you manage."
                : " Member access is read-only."}
          </p>
        </div>
      </div>

      {canCreate ? (
        <Card>
          <h3 className="font-medium">Create a project</h3>
          <form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-2">
            <Field label="Name">
              <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </Field>
            <Field label="Status">
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
            </Field>
            <Field label="Start date">
              <input type="date" className={inputClass} value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} required min="2000-01-01" max="2100-12-31" />
            </Field>
            <Field label="End date">
              <input type="date" className={inputClass} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} required min="2000-01-01" max="2100-12-31" />
            </Field>
            <Field label="Ministry / department">
              <input className={inputClass} value={form.ministry} onChange={(e) => setForm({ ...form, ministry: e.target.value })} />
            </Field>
            <Field label="Sector">
              <input className={inputClass} value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
            </Field>
            <Field label="State / UT">
              <input className={inputClass} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </Field>
            <Field label="Original approved cost (₹ Cr)">
              <input type="number" step="0.01" className={inputClass} value={form.original_cost} onChange={(e) => setForm({ ...form, original_cost: e.target.value })} />
            </Field>
            <Field label="Revised cost (₹ Cr)">
              <input type="number" step="0.01" className={inputClass} value={form.revised_cost} onChange={(e) => setForm({ ...form, revised_cost: e.target.value })} />
            </Field>
            <Field label="Cumulative expenditure (₹ Cr)">
              <input type="number" step="0.01" className={inputClass} value={form.expenditure} onChange={(e) => setForm({ ...form, expenditure: e.target.value })} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Description">
                <textarea className={inputClass} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </Field>
            </div>
            {error ? <p className="text-sm text-accent md:col-span-2">{error}</p> : null}
            <div className="md:col-span-2">
              <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">
                Save project
              </button>
            </div>
          </form>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        {projects?.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`}>
            <Card className="h-full hover:border-navy/30">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-medium">{p.name}</h3>
                <div className="flex gap-1">
                  {p.health?.band ? <StatusPill status={p.health.band} /> : null}
                  <StatusPill status={p.computed_status} />
                </div>
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-ink/60">{p.description}</p>
              <div className="mt-4">
                <div className="mb-1 flex justify-between text-xs text-ink/50">
                  <span>System-calculated {p.progress}%</span>
                  <span>{p.delayed_task_count} delayed</span>
                </div>
                <ProgressBar value={p.progress} />
              </div>
              <p className="mt-3 text-xs text-ink/50">
                {p.start_date} → {p.end_date} · {p.manager?.name} · Data source: {p.data_source || "manual"}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
