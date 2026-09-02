import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Timeline from "../components/Timeline.jsx";
import { Card, Field, InsightBanner, ProgressBar, StatusPill, inputClass } from "../components/ui.jsx";

ChartJS.register(ArcElement, Tooltip, Legend);

const tabs = ["Tasks", "Milestones", "Team", "Timeline", "Progress"];

const emptyTask = {
  title: "",
  description: "",
  due_date: "",
  priority: "medium",
  milestone_id: "",
  assignee_id: "",
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState("Tasks");
  const [error, setError] = useState("");
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [milestoneForm, setMilestoneForm] = useState({ title: "", due_date: "", status: "pending" });
  const [memberId, setMemberId] = useState("");

  function load() {
    return api(`/api/projects/${id}`)
      .then(setProject)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    if (user.role === "admin" || user.role === "project_manager") {
      api("/api/users").then(setUsers).catch(() => {});
    }
  }, [id, user.role]);

  const canManage = useMemo(() => {
    if (!project) return false;
    return user.role === "admin" || (user.role === "project_manager" && project.manager_id === user.id);
  }, [project, user]);

  if (error) return <p className="text-accent">{error}</p>;
  if (!project) return <p>Loading project…</p>;

  async function addTask(e) {
    e.preventDefault();
    await api(`/api/projects/${id}/tasks`, {
      method: "POST",
      body: JSON.stringify({
        ...taskForm,
        milestone_id: taskForm.milestone_id || null,
        assignee_id: taskForm.assignee_id || null,
      }),
    });
    setTaskForm(emptyTask);
    load();
  }

  async function patchTask(taskId, body) {
    await api(`/api/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(body) });
    load();
  }

  async function addMilestone(e) {
    e.preventDefault();
    await api(`/api/projects/${id}/milestones`, { method: "POST", body: JSON.stringify(milestoneForm) });
    setMilestoneForm({ title: "", due_date: "", status: "pending" });
    load();
  }

  async function addMember(e) {
    e.preventDefault();
    if (!memberId) return;
    await api(`/api/projects/${id}/members`, { method: "POST", body: JSON.stringify({ user_id: Number(memberId) }) });
    setMemberId("");
    load();
  }

  const statusCounts = {
    todo: project.tasks.filter((t) => t.status === "todo").length,
    in_progress: project.tasks.filter((t) => t.status === "in_progress").length,
    done: project.tasks.filter((t) => t.status === "done").length,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.2em] text-ink/45 uppercase">Project</p>
          <h2 className="font-serif mt-1 text-3xl">{project.name}</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink/65">{project.description}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPill status={project.computed_status} />
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded border border-sand bg-white px-2 py-1 text-sm"
                value={project.status}
                onChange={(e) =>
                  api(`/api/projects/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({ ...project, status: e.target.value }),
                  }).then(load)
                }
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="completed">Completed</option>
              </select>
              <button
                type="button"
                className="text-sm text-accent hover:underline"
                onClick={async () => {
                  await api(`/api/projects/${id}`, { method: "DELETE" });
                  navigate("/projects");
                }}
              >
                Remove project
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <InsightBanner insight={project.insights?.headline} />

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <p className="text-xs text-ink/50 uppercase">Progress</p>
          <p className="font-serif mt-1 text-2xl">{project.progress}%</p>
          <div className="mt-2"><ProgressBar value={project.progress} /></div>
        </Card>
        <Card>
          <p className="text-xs text-ink/50 uppercase">Window</p>
          <p className="mt-1 text-sm">{project.start_date} → {project.end_date}</p>
          <p className="mt-1 text-xs text-ink/50">Schedule {project.insights?.schedule_elapsed_pct}% elapsed</p>
        </Card>
        <Card>
          <p className="text-xs text-ink/50 uppercase">Delayed tasks</p>
          <p className="font-serif mt-1 text-2xl">{project.delayed_task_count}</p>
        </Card>
        <Card>
          <p className="text-xs text-ink/50 uppercase">Manager</p>
          <p className="mt-1 text-sm">{project.manager?.name}</p>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-full px-4 py-1.5 text-sm ${tab === t ? "bg-navy text-white" : "bg-white border border-sand"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Tasks" ? (
        <div className="space-y-4">
          {canManage ? (
            <Card>
              <h3 className="font-medium">Add task</h3>
              <form onSubmit={addTask} className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="Title">
                  <input className={inputClass} value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} required />
                </Field>
                <Field label="Due date">
                  <input type="date" className={inputClass} value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} required />
                </Field>
                <Field label="Priority">
                  <select className={inputClass} value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <Field label="Assignee">
                  <select className={inputClass} value={taskForm.assignee_id} onChange={(e) => setTaskForm({ ...taskForm, assignee_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {project.members.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Milestone">
                  <select className={inputClass} value={taskForm.milestone_id} onChange={(e) => setTaskForm({ ...taskForm, milestone_id: e.target.value })}>
                    <option value="">None</option>
                    {project.milestones.map((m) => (
                      <option key={m.id} value={m.id}>{m.title}</option>
                    ))}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Description">
                    <textarea className={inputClass} rows={2} value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
                  </Field>
                </div>
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Add task</button>
              </form>
            </Card>
          ) : null}

          <div className="overflow-x-auto rounded-xl border border-sand bg-white">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-paper text-xs tracking-wide text-ink/50 uppercase">
                <tr>
                  <th className="px-4 py-3">Task</th>
                  <th className="px-4 py-3">Assignee</th>
                  <th className="px-4 py-3">Due</th>
                  <th className="px-4 py-3">Priority</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Progress</th>
                </tr>
              </thead>
              <tbody>
                {project.tasks.map((t) => {
                  const canEdit = canManage;
                  return (
                    <tr key={t.id} className="border-t border-sand">
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.title}</p>
                        <p className="text-xs text-ink/50">{t.description}</p>
                      </td>
                      <td className="px-4 py-3">{t.assignee_name || "—"}</td>
                      <td className="px-4 py-3">{t.due_date}</td>
                      <td className="px-4 py-3"><StatusPill status={t.priority} /></td>
                      <td className="px-4 py-3">
                        {canEdit ? (
                          <select
                            className="rounded border border-sand bg-paper px-2 py-1"
                            value={t.status}
                            onChange={(e) => patchTask(t.id, { status: e.target.value })}
                          >
                            <option value="todo">To do</option>
                            <option value="in_progress">In progress</option>
                            <option value="done">Done</option>
                          </select>
                        ) : (
                          <StatusPill status={t.status} />
                        )}
                      </td>
                      <td className="px-4 py-3 w-40">
                        {canEdit ? (
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={t.progress}
                            onChange={(e) => patchTask(t.id, { progress: Number(e.target.value), status: t.status })}
                          />
                        ) : (
                          <ProgressBar value={t.progress} />
                        )}
                        <span className="text-xs text-ink/50">{t.progress}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {tab === "Milestones" ? (
        <div className="space-y-4">
          {canManage ? (
            <Card>
              <h3 className="font-medium">Add milestone</h3>
              <form onSubmit={addMilestone} className="mt-3 grid gap-3 md:grid-cols-3">
                <Field label="Title">
                  <input className={inputClass} value={milestoneForm.title} onChange={(e) => setMilestoneForm({ ...milestoneForm, title: e.target.value })} required />
                </Field>
                <Field label="Due date">
                  <input type="date" className={inputClass} value={milestoneForm.due_date} onChange={(e) => setMilestoneForm({ ...milestoneForm, due_date: e.target.value })} required />
                </Field>
                <Field label="Status">
                  <select className={inputClass} value={milestoneForm.status} onChange={(e) => setMilestoneForm({ ...milestoneForm, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
                </Field>
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Add milestone</button>
              </form>
            </Card>
          ) : null}
          <div className="grid gap-3">
            {project.milestones.map((m) => (
              <Card key={m.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{m.title}</p>
                  <p className="text-sm text-ink/50">Due {m.due_date}</p>
                </div>
                {canManage ? (
                  <select
                    className="rounded border border-sand bg-paper px-2 py-1 text-sm"
                    value={m.status}
                    onChange={(e) =>
                      api(`/api/milestones/${m.id}`, {
                        method: "PUT",
                        body: JSON.stringify({ ...m, status: e.target.value }),
                      }).then(load)
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="in_progress">In progress</option>
                    <option value="completed">Completed</option>
                  </select>
                ) : (
                  <StatusPill status={m.status} />
                )}
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "Team" ? (
        <div className="space-y-4">
          {canManage ? (
            <Card>
              <form onSubmit={addMember} className="flex flex-wrap items-end gap-3">
                <div className="min-w-56 flex-1">
                  <Field label="Add member">
                    <select className={inputClass} value={memberId} onChange={(e) => setMemberId(e.target.value)}>
                      <option value="">Select a user</option>
                      {users
                        .filter((u) => !project.members.some((m) => m.id === u.id))
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role.replaceAll("_", " ")})
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">
                  Assign
                </button>
              </form>
            </Card>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            {project.members.map((m) => (
              <Card key={m.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-sm text-ink/50">{m.email}</p>
                </div>
                <StatusPill status={m.role} />
              </Card>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "Timeline" ? (
        <Card>
          <h3 className="font-medium">Gantt-style timeline</h3>
          <p className="mt-1 text-sm text-ink/50">Task bars scale with progress; diamonds of colour on the right mark milestone due dates. The orange tick is today.</p>
          <div className="mt-4">
            <Timeline project={project} tasks={project.tasks} milestones={project.milestones} />
          </div>
        </Card>
      ) : null}

      {tab === "Progress" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="font-medium">Task status</h3>
            <div className="mx-auto mt-4 h-56 max-w-xs">
              <Doughnut
                data={{
                  labels: ["To do", "In progress", "Done"],
                  datasets: [
                    {
                      data: [statusCounts.todo, statusCounts.in_progress, statusCounts.done],
                      backgroundColor: ["#cfc6b6", "#16345c", "#1f6f6a"],
                      borderWidth: 0,
                    },
                  ],
                }}
                options={{ plugins: { legend: { position: "bottom" } } }}
              />
            </div>
          </Card>
          <Card>
            <h3 className="font-medium">Health notes</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {project.insights.alerts.map((a) => (
                <li key={a.code} className="rounded-lg border border-sand p-3">
                  <StatusPill status={a.severity} />
                  <p className="mt-2">{a.message}</p>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
