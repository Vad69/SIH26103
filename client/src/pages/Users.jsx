import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import { Card, Field, StatusPill, inputClass } from "../components/ui.jsx";

const empty = {
  name: "",
  email: "",
  password: "",
  role: "team_member",
};

function roleLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "project_manager") return "Project manager";
  return "Member";
}

export default function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    api("/api/users")
      .then(setUsers)
      .catch((e) => setError(e.message));
  }

  useEffect(load, []);

  if (user.role !== "admin") return <Navigate to="/" replace />;

  async function create(e) {
    e.preventDefault();
    setError("");
    setNotice("");
    try {
      await api("/api/users", { method: "POST", body: JSON.stringify(form) });
      setForm(empty);
      setNotice("Account created.");
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(id) {
    setError("");
    setNotice("");
    try {
      await api(`/api/users/${id}`, { method: "DELETE" });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Administration</p>
        <h2 className="font-serif mt-1 text-3xl">User management</h2>
        <p className="mt-2 max-w-2xl text-sm text-ink/60">
          Only Vardaan (Admin) can create or remove accounts. Project managers and members can be added here. A second Admin cannot be created.
        </p>
      </div>

      <Card>
        <h3 className="font-medium">Add member or project manager</h3>
        <form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Name">
            <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field label="Email">
            <input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </Field>
          <Field label="Password">
            <input type="password" className={inputClass} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={6} required />
          </Field>
          <Field label="Role">
            <select className={inputClass} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="team_member">Member</option>
              <option value="project_manager">Project manager</option>
            </select>
          </Field>
          {error ? <p className="text-sm text-accent md:col-span-2">{error}</p> : null}
          {notice ? <p className="text-sm text-teal md:col-span-2">{notice}</p> : null}
          <div className="md:col-span-2">
            <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">
              Create account
            </button>
          </div>
        </form>
      </Card>

      <Card>
        <h3 className="font-medium">Accounts</h3>
        <ul className="mt-3 divide-y divide-sand">
          {users?.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="text-sm text-ink/50">{u.email}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusPill status={u.role === "team_member" ? "pending" : u.role} />
                <span className="text-xs text-ink/50">{roleLabel(u.role)}</span>
                {u.role !== "admin" ? (
                  <button className="text-sm text-accent hover:underline" type="button" onClick={() => remove(u.id)}>
                    Remove
                  </button>
                ) : (
                  <span className="text-xs text-ink/40">Unique admin</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
