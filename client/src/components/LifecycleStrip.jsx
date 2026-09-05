import { StatusPill } from "./ui.jsx";

const TONE = {
  completed: "border-teal bg-teal/10",
  current: "border-navy bg-navy/10",
  delayed: "border-accent bg-accent/10",
  blocked: "border-accent bg-accent text-white",
  upcoming: "border-sand bg-white",
};

export function lifecycleTone(stage, currentKey) {
  if (!stage) return "upcoming";
  if (stage.status === "blocked") return "blocked";
  if (stage.status === "delayed") return "delayed";
  if (stage.status === "completed") return "completed";
  if (stage.status === "not_applicable") return "upcoming";
  if (stage.stage_key === currentKey || stage.status === "in_progress") return "current";
  return "upcoming";
}

export default function LifecycleStrip({ stages = [], currentKey }) {
  if (!stages.length) {
    return <p className="text-sm text-ink/50">Lifecycle stages will appear once this project is saved.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-[920px] gap-2">
        {stages.map((s) => {
          const tone = lifecycleTone(s, currentKey);
          return (
            <li key={s.stage_key} className={`min-w-[7.5rem] flex-1 rounded-lg border px-2 py-2 ${TONE[tone]}`}>
              <p className="text-[10px] uppercase tracking-wide opacity-70">{s.sort_order}. {tone}</p>
              <p className="mt-1 text-xs font-medium leading-tight">{s.stage_key.replaceAll("_", " ")}</p>
              <div className="mt-1"><StatusPill status={s.status} /></div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
