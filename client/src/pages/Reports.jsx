import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, Doughnut } from "react-chartjs-2";
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
import { Card, StatusPill } from "../components/ui.jsx";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export default function Reports() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/reports").then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="text-accent">{error}</p>;
  if (!data) return <p>Building reports…</p>;

  const statusData = {
    labels: Object.keys(data.by_status).map((k) => k.replaceAll("_", " ")),
    datasets: [
      {
        data: Object.values(data.by_status),
        backgroundColor: ["#8aa0b8", "#1f6f6a", "#c45c26", "#10233d", "#cfc6b6"],
        borderWidth: 0,
      },
    ],
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Reports</p>
        <h2 className="font-serif mt-1 text-3xl">Completion and delays</h2>
        <p className="mt-2 text-sm text-ink/55">
          Generated {new Date(data.generated_at).toLocaleString()} · overall system-calculated progress {data.overall_progress}% (task averages; not official physical progress)
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-medium">Completion statistics</h3>
          <p className="mt-2 text-sm text-ink/60">
            {data.completion.done} tasks done · {data.completion.open} still open
          </p>
          <div className="mx-auto mt-4 h-56 max-w-xs">
            <Doughnut data={statusData} options={{ plugins: { legend: { position: "bottom" } } }} />
          </div>
        </Card>
        <Card>
          <h3 className="font-medium">Progress report</h3>
          <div className="mt-4 h-56">
            <Bar
              data={{
                labels: data.projects.map((p) => p.name.split(" ").slice(0, 3).join(" ")),
                datasets: [
                  {
                    label: "Progress",
                    data: data.projects.map((p) => p.progress),
                    backgroundColor: "#16345c",
                    borderRadius: 6,
                  },
                ],
              }}
              options={{
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { max: 100, beginAtZero: true } },
              }}
            />
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="font-medium">Top delay reasons</h3>
        {data.delay_reasons?.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {data.delay_reasons.map((r) => (
              <li key={r.id} className="flex justify-between">
                <span>{r.label}</span>
                <span>{r.count} projects</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink/50">No coded delay reasons yet.</p>
        )}
      </Card>

      <Card>
        <h3 className="font-medium">Project summary</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs tracking-wide text-ink/50 uppercase">
              <tr>
                <th className="py-2">Project</th>
                <th className="py-2">Manager</th>
                <th className="py-2">Status</th>
                <th className="py-2">Progress</th>
                <th className="py-2">Milestones</th>
                <th className="py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.map((p) => (
                <tr key={p.id} className="border-t border-sand">
                  <td className="py-2">
                    <Link className="font-medium hover:underline" to={`/projects/${p.id}`}>
                      {p.name}
                    </Link>
                  </td>
                  <td className="py-2">{p.manager}</td>
                  <td className="py-2"><StatusPill status={p.computed_status} /></td>
                  <td className="py-2">{p.progress}%</td>
                  <td className="py-2">{p.milestone_done}/{p.milestone_total}</td>
                  <td className="py-2 text-ink/60">{p.insights.headline.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h3 className="font-medium">Delayed activities</h3>
        {data.delayed_activities.length ? (
          <ul className="mt-3 divide-y divide-sand text-sm">
            {data.delayed_activities.map((d, i) => (
              <li key={`${d.project_id}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium">{d.task}</p>
                  <p className="text-ink/50">{d.project} · {d.assignee || "Unassigned"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill status={d.priority} />
                  <span className="text-ink/50">due {d.due_date}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-ink/50">No delayed activities in the current workspace.</p>
        )}
      </Card>
    </div>
  );
}
