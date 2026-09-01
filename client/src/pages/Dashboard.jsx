import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from "chart.js";
import { api } from "../api.js";
import { Card, InsightBanner, ProgressBar, StatusPill } from "../components/ui.jsx";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/dashboard").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-accent">{error}</p>;
  if (!data) return <p>Loading dashboard…</p>;

  const { stats } = data;
  const doughnut = {
    labels: ["Active", "Completed", "Delayed", "Planning", "On hold"],
    datasets: [
      {
        data: [stats.active, stats.completed, stats.delayed, stats.planning, stats.on_hold],
        backgroundColor: ["#1f6f6a", "#10233d", "#c45c26", "#8aa0b8", "#cfc6b6"],
        borderWidth: 0,
      },
    ],
  };
  const bar = {
    labels: data.projects.map((p) => p.name.split(" ").slice(0, 3).join(" ")),
    datasets: [
      {
        label: "Progress %",
        data: data.projects.map((p) => p.progress),
        backgroundColor: "#16345c",
        borderRadius: 6,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Overview</p>
        <h2 className="font-serif mt-1 text-3xl">Monitoring desk</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Total projects", stats.total],
          ["Active", stats.active],
          ["Completed", stats.completed],
          ["Delayed", stats.delayed],
          ["Overall progress", `${stats.overall_progress}%`],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-xs tracking-wide text-ink/50 uppercase">{label}</p>
            <p className="mt-2 font-serif text-3xl">{value}</p>
          </Card>
        ))}
      </div>

      {data.risk_alerts[0] ? <InsightBanner insight={data.risk_alerts[0].headline} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-medium">Portfolio mix</h3>
          <div className="mx-auto mt-4 h-56 max-w-xs">
            <Doughnut data={doughnut} options={{ plugins: { legend: { position: "bottom" } } }} />
          </div>
        </Card>
        <Card>
          <h3 className="font-medium">Progress by project</h3>
          <div className="mt-4 h-56">
            <Bar
              data={bar}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { max: 100, beginAtZero: true } },
              }}
            />
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-medium">Upcoming deadlines</h3>
          <ul className="mt-3 divide-y divide-sand">
            {data.upcoming_deadlines.length ? (
              data.upcoming_deadlines.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link className="font-medium hover:underline" to={`/projects/${t.project_id}`}>
                      {t.title}
                    </Link>
                    <p className="text-ink/50">{t.project_name}</p>
                  </div>
                  <span className="text-ink/60">{t.due_date}</span>
                </li>
              ))
            ) : (
              <li className="py-2 text-sm text-ink/50">No upcoming open tasks.</li>
            )}
          </ul>
        </Card>
        <Card>
          <h3 className="font-medium">Delayed tasks</h3>
          <ul className="mt-3 divide-y divide-sand">
            {data.delayed_tasks.length ? (
              data.delayed_tasks.map((t) => (
                <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                  <div>
                    <Link className="font-medium hover:underline" to={`/projects/${t.project_id}`}>
                      {t.title}
                    </Link>
                    <p className="text-ink/50">{t.project_name}</p>
                  </div>
                  <StatusPill status={t.priority} />
                </li>
              ))
            ) : (
              <li className="py-2 text-sm text-ink/50">Nothing overdue in your workspace.</li>
            )}
          </ul>
        </Card>
      </div>

      {data.risk_alerts.length > 1 ? (
        <Card>
          <h3 className="font-medium">Other risk notes</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {data.risk_alerts.slice(1).map((a) => (
              <li key={a.project_id}>
                <Link className="font-medium hover:underline" to={`/projects/${a.project_id}`}>
                  {a.project_name}
                </Link>
                <span className="text-ink/60"> — {a.headline.message}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h3 className="font-medium">Projects at a glance</h3>
        <div className="mt-4 space-y-3">
          {data.projects.map((p) => (
            <Link key={p.id} to={`/projects/${p.id}`} className="block rounded-lg border border-sand p-3 hover:bg-paper">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="font-medium">{p.name}</span>
                <StatusPill status={p.computed_status} />
              </div>
              <ProgressBar value={p.progress} />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
