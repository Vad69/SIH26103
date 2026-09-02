import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth.jsx";
import { Field, inputClass } from "../components/ui.jsx";

const demos = [
  { role: "Vardaan · Admin", email: "vardaan@mospi.gov.in", password: "vardaan123" },
  { role: "Ishika Basu · Project manager", email: "ishika@mospi.gov.in", password: "ishika123" },
  { role: "Disha Ghosh · Member", email: "disha@mospi.gov.in", password: "disha123" },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("vardaan@mospi.gov.in");
  const [password, setPassword] = useState("vardaan123");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-between p-12">
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, #1f6f6a 0, transparent 40%), radial-gradient(circle at 80% 80%, #c45c26 0, transparent 35%)",
        }} />
        <div className="relative">
          <p className="text-xs tracking-[0.28em] text-sand/70 uppercase">Ministry of Statistics and Programme Implementation</p>
          <h1 className="font-serif mt-6 max-w-md text-5xl leading-tight text-white">
            One desk for every project that still has a deadline.
          </h1>
          <p className="mt-6 max-w-md text-sand/80">
            SIH26103 — a prototype decision-support layer inspired by government project-monitoring workflows (PAIMANA-aligned concepts). Seeded records are demo data, not live PAIMANA extracts.
          </p>
        </div>
        <dl className="relative grid max-w-md grid-cols-2 gap-6 text-sm">
          <div>
            <dt className="text-sand/60">Problem code</dt>
            <dd className="mt-1 font-medium text-white">SIH26103</dd>
          </div>
          <div>
            <dt className="text-sand/60">Theme</dt>
            <dd className="mt-1 font-medium text-white">Smart Automation</dd>
          </div>
        </dl>
      </section>

      <section className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-md">
          <p className="text-xs tracking-[0.22em] text-ink/50 uppercase lg:hidden">MoSPI · SIH26103</p>
          <h2 className="font-serif mt-2 text-3xl">Sign in to Pragati</h2>
          <p className="mt-2 text-sm text-ink/60">Sign in with your account. Demo credentials for the hackathon are listed below.</p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            <Field label="Email">
              <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
            </Field>
            <Field label="Password">
              <input className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
            </Field>
            {error ? <p className="text-sm text-accent">{error}</p> : null}
            <button
              disabled={busy}
              className="w-full rounded-md bg-navy py-2.5 text-sm font-medium text-white hover:bg-ink disabled:opacity-60"
              type="submit"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <div className="mt-8 rounded-xl border border-sand bg-white p-4">
            <p className="text-xs font-medium tracking-wide text-ink/50 uppercase">Demo accounts</p>
            <ul className="mt-3 space-y-2">
              {demos.map((d) => (
                <li key={d.email}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-paper"
                    onClick={() => {
                      setEmail(d.email);
                      setPassword(d.password);
                    }}
                  >
                    <span>
                      <span className="font-medium">{d.role}</span>
                      <span className="ml-2 text-ink/50">{d.email}</span>
                    </span>
                    <span className="text-xs text-ink/40">fill</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
