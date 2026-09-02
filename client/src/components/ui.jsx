export function StatusPill({ status }) {
  const map = {
    active: "bg-teal/15 text-teal",
    planning: "bg-navy/10 text-navy",
    completed: "bg-ink/10 text-ink",
    delayed: "bg-accent/15 text-accent",
    on_hold: "bg-sand text-ink/70",
    todo: "bg-sand text-ink/70",
    in_progress: "bg-navy/10 text-navy",
    done: "bg-teal/15 text-teal",
    pending: "bg-sand text-ink/70",
    high: "bg-accent/15 text-accent",
    critical: "bg-accent text-white",
    medium: "bg-navy/10 text-navy",
    low: "bg-sand text-ink/70",
    ok: "bg-teal/15 text-teal",
    on_track: "bg-teal/15 text-teal",
    watch: "bg-navy/10 text-navy",
    at_risk: "bg-accent/15 text-accent",
    open: "bg-accent/15 text-accent",
    resolved: "bg-teal/15 text-teal",
    admin: "bg-ink/10 text-ink",
    project_manager: "bg-navy/10 text-navy",
  };
  const label = String(status || "").replaceAll("_", " ");
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${map[status] || "bg-sand"}`}>
      {label}
    </span>
  );
}

export function ProgressBar({ value }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-sand">
      <div className="h-full rounded-full bg-teal" style={{ width: `${Math.max(0, Math.min(100, value || 0))}%` }} />
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-xl border border-sand bg-white p-5 shadow-sm ${className}`}>{children}</div>;
}

export function Field({ label, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-ink/70">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "w-full rounded-md border border-sand bg-paper px-3 py-2 text-sm outline-none focus:border-navy";

export function InsightBanner({ insight }) {
  if (!insight) return null;
  const tone =
    insight.severity === "high" || insight.severity === "critical"
      ? "border-accent/40 bg-accent/10"
      : insight.severity === "ok" || insight.severity === "on_track"
        ? "border-teal/30 bg-teal/10"
        : "border-navy/20 bg-navy/5";
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${tone}`}>
      <p className="text-[11px] font-medium tracking-[0.16em] text-ink/50 uppercase">
        {insight.title || "Risk intelligence"}
      </p>
      <p className="mt-1 font-medium">{insight.message}</p>
    </div>
  );
}
