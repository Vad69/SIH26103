function toTime(d) {
  return new Date(`${d}T00:00:00`).getTime();
}

export default function Timeline({ project, tasks, milestones }) {
  const start = toTime(project.start_date);
  const end = toTime(project.end_date);
  const span = Math.max(end - start, 1);
  const today = Date.now();
  const todayPct = Math.max(0, Math.min(100, ((today - start) / span) * 100));

  const rows = [
    ...milestones.map((m) => ({
      id: `m-${m.id}`,
      label: m.title,
      kind: "Milestone",
      left: ((toTime(m.due_date) - start) / span) * 100,
      width: 1.2,
      tone: m.status === "completed" ? "bg-teal" : "bg-accent",
    })),
    ...tasks.map((t) => {
      const due = toTime(t.due_date);
      const width = Math.max(8, ((due - start) / span) * 100 * (t.progress / 100 || 0.12));
      return {
        id: `t-${t.id}`,
        label: t.title,
        kind: t.status === "done" ? "Done" : t.priority,
        left: 0,
        width: Math.min(100, width),
        tone: t.status === "done" ? "bg-teal" : t.priority === "critical" ? "bg-accent" : "bg-navy",
      };
    }),
  ];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px] space-y-3">
        <div className="relative h-6 text-[11px] text-ink/50">
          <span className="absolute left-0">{project.start_date}</span>
          <span className="absolute right-0">{project.end_date}</span>
          <div className="absolute top-5 h-px w-full bg-sand" />
          <div className="absolute top-3 h-4 w-px bg-accent" style={{ left: `${todayPct}%` }} title="Today" />
        </div>
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[180px_1fr] items-center gap-3">
            <div className="truncate text-sm">
              {r.label}
              <span className="ml-2 text-[11px] text-ink/40">{r.kind}</span>
            </div>
            <div className="relative h-6 rounded bg-sand/70">
              <div
                className={`absolute top-1 h-4 rounded ${r.tone}`}
                style={{ left: `${r.left}%`, width: `${Math.max(r.width, 1.5)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
