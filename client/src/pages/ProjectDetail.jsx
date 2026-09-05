import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from "chart.js";
import { api } from "../api.js";
import { useAuth } from "../auth.jsx";
import Timeline from "../components/Timeline.jsx";
import LifecycleStrip from "../components/LifecycleStrip.jsx";
import { Card, Field, InsightBanner, ProgressBar, StatusPill, inputClass } from "../components/ui.jsx";

ChartJS.register(ArcElement, Tooltip, Legend);

const tabs = [
  "Outlook",
  "Lifecycle",
  "Risk",
  "Finance",
  "Pre-construction",
  "Tasks",
  "Milestones",
  "Issues",
  "Interventions",
  "Resources",
  "Testing",
  "Team",
  "Timeline",
  "Audit",
];

const emptyTask = {
  title: "",
  description: "",
  due_date: "",
  priority: "medium",
  milestone_id: "",
  assignee_id: "",
  wbs_group: "other",
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [users, setUsers] = useState([]);
  const [tab, setTab] = useState("Outlook");
  const [error, setError] = useState("");
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [milestoneForm, setMilestoneForm] = useState({ title: "", due_date: "", status: "pending" });
  const [memberId, setMemberId] = useState("");
  const [meta, setMeta] = useState({ delay_reasons: [] });
  const [issueForm, setIssueForm] = useState({ title: "", category: "procurement", severity: "high", owner: "", intervention: "", due_date: "" });
  const [ivForm, setIvForm] = useState({ action: "", authority: "", assigned_officer: "", due_date: "", priority: "high" });
  const [preconForm, setPreconForm] = useState({ name: "", category: "environmental_clearance", status: "not_started", planned_completion: "", authority: "", remarks: "" });
  const [quick, setQuick] = useState({ reported_progress: "", status: "active", blocker: "", remarks: "" });
  const [nlpLive, setNlpLive] = useState(null);

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
    api("/api/meta").then(setMeta).catch(() => {});
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
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span>Stage: <strong>{project.current_stage_label || project.insights?.outlook?.current_stage_label || "—"}</strong></span>
            <StatusPill status={project.insights?.health?.band} />
            <span>Forecast slippage: {project.insights?.forecast?.estimated_slippage_days ?? "—"} days</span>
            <span className="text-ink/50">Data source: {(project.data_source || "manual").replace("_", " ")}</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPill status={project.computed_status} />
          {canManage ? (
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="rounded border border-sand bg-white px-2 py-1 text-sm"
                value={project.status}
                onChange={(e) => {
                  setError("");
                  api(`/api/projects/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({ ...project, status: e.target.value }),
                  }).then(load).catch((err) => setError(err.message));
                }}
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

      <InsightBanner
        insight={
          project.insights?.health?.early_warning
            ? { title: "Early warning", severity: "high", message: project.insights.health.early_warning_text }
            : project.insights?.headline
        }
      />

      <Card>
        <p className="text-xs uppercase text-ink/50">Project lifecycle</p>
        <p className="mt-1 text-xs text-ink/50">Monitoring stages only — not an e-procurement or ERP workflow.</p>
        <div className="mt-3">
          <LifecycleStrip stages={project.lifecycle_stages || []} currentKey={project.current_stage} />
        </div>
        {project.commencement_delay_days > 0 ? (
          <p className="mt-3 text-sm font-medium">{project.commencement_delay_days} days commencement delay</p>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
        <p className="text-xs text-ink/50 uppercase">System-calculated progress</p>
          <p className="font-serif mt-1 text-2xl">{project.progress}%</p>
          <p className="mt-1 text-[11px] text-ink/50">Average of task progress. Not official physical progress.</p>
          {project.reported_physical_progress != null && project.reported_physical_progress !== "" ? (
            <p className="mt-2 text-xs">Reported physical progress: {project.reported_physical_progress}%</p>
          ) : (
            <p className="mt-2 text-xs text-ink/50">No ministry-reported physical progress entered.</p>
          )}
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
                <Field label="WBS group">
                  <select className={inputClass} value={taskForm.wbs_group} onChange={(e) => setTaskForm({ ...taskForm, wbs_group: e.target.value })}>
                    {(meta.wbs_groups || [{ id: "other", label: "Other" }]).map((g) => (
                      <option key={g.id} value={g.id}>{g.label}</option>
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
                  <th className="px-4 py-3">WBS</th>
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
                      <td className="px-4 py-3">{(t.wbs_group || "other").replaceAll("_", " ")}</td>
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

      {tab === "Outlook" ? (
        <div className="space-y-4">
          <Card>
            <p className="text-xs uppercase text-ink/50">Project outlook</p>
            <p className="mt-1 text-xs text-ink/50">Single executive summary from canonical project data. Health is rule-based; forecast is a prototype trajectory.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div><p className="text-ink/50">Current stage</p><p className="font-medium">{project.insights?.outlook?.current_stage_label || project.current_stage_label || "—"}</p></div>
              <div><p className="text-ink/50">Health</p><StatusPill status={project.insights?.outlook?.current_health} /></div>
              <div><p className="text-ink/50">Forecast</p><p className="font-medium">{project.insights?.forecast?.estimated_slippage_days} days potential schedule slippage</p></div>
              <div><p className="text-ink/50">Physical progress</p><p className="font-medium">{project.insights?.outlook?.physical_progress ?? project.progress}%</p></div>
              <div><p className="text-ink/50">Financial expenditure</p><p className="font-medium">{project.insights?.outlook?.financial_progress ?? project.insights?.finance?.financial_progress}%</p></div>
              {project.insights?.outlook?.mismatch ? (
                <div className="sm:col-span-2"><p className="font-medium text-accent">{project.insights.outlook.mismatch}</p></div>
              ) : null}
            </div>
            <p className="mt-3 text-sm">Estimated completion: {project.insights?.forecast?.estimated_completion} · forecast risk {project.insights?.forecast?.schedule_risk}</p>
            <p className="mt-1 text-xs text-ink/50">{project.insights?.forecast?.method_note}</p>
            <h3 className="mt-4 font-medium">Why at risk</h3>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {(project.insights?.outlook?.why || []).map((w) => <li key={w}>{w}</li>)}
            </ul>
            {project.insights?.outlook?.bottleneck ? (
              <div className="mt-4 rounded-lg bg-paper p-3 text-sm">
                <p className="font-medium">AI-assisted bottleneck (suggestion)</p>
                <p>{project.insights.outlook.bottleneck.label} · confidence {project.insights.outlook.bottleneck.confidence_band}
                  {project.insights.outlook.bottleneck.confidence != null ? ` (${Math.round(project.insights.outlook.bottleneck.confidence * 100)}%)` : ""}</p>
                <p className="mt-1 text-xs text-ink/60">{project.insights.outlook.bottleneck.explanation}</p>
              </div>
            ) : null}
            {project.insights?.outlook?.open_intervention ? (
              <p className="mt-3 text-sm">Open intervention: {project.insights.outlook.open_intervention.action}</p>
            ) : null}
            <p className="mt-3 text-sm font-medium">Recommended action: {project.insights?.outlook?.recommended_action}</p>
            <p className="mt-2 text-xs text-ink/45">{project.insights?.outlook?.disclaimer}</p>
          </Card>
          {canManage ? (
            <Card>
              <h3 className="font-medium">Quick ground update</h3>
              <p className="mt-1 text-xs text-ink/50">Short field update. NLP suggests a delay category; it does not overwrite your coded reason until you accept it on an issue.</p>
              <form
                className="mt-3 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  api(`/api/projects/${id}/quick-update`, { method: "POST", body: JSON.stringify(quick) })
                    .then((data) => {
                      setNlpLive(data.nlp_suggestion);
                      setQuick({ reported_progress: "", status: project.status, blocker: "", remarks: "" });
                      load();
                    })
                    .catch((err) => setError(err.message));
                }}
              >
                <Field label="Reported progress %"><input className={inputClass} type="number" min="0" max="100" value={quick.reported_progress} onChange={(e) => setQuick({ ...quick, reported_progress: e.target.value })} /></Field>
                <Field label="Status">
                  <select className={inputClass} value={quick.status} onChange={(e) => setQuick({ ...quick, status: e.target.value })}>
                    <option value="planning">Planning</option>
                    <option value="active">Active</option>
                    <option value="on_hold">On hold</option>
                    <option value="completed">Completed</option>
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Main delay / blocker">
                    <input className={inputClass} value={quick.blocker} onChange={(e) => setQuick({ ...quick, blocker: e.target.value })} />
                  </Field>
                </div>
                <div className="md:col-span-2">
                  <Field label="Remarks"><textarea className={inputClass} rows={2} value={quick.remarks} onChange={(e) => setQuick({ ...quick, remarks: e.target.value })} /></Field>
                </div>
                {nlpLive ? <p className="md:col-span-2 text-sm">Suggestion: {nlpLive.label} ({nlpLive.confidence_band})</p> : null}
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Save update</button>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "Risk" ? (
        <div className="space-y-4">
          <Card>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs tracking-wide text-ink/50 uppercase">Project health score</p>
                <p className="font-serif mt-1 text-5xl">{project.insights.health.score} / 100</p>
              </div>
              <StatusPill status={project.insights.health.band} />
            </div>
            <p className="mt-3 text-sm font-medium text-ink/80">
              Risk score is a rule-based decision-support indicator, not an ML prediction.
            </p>
            <p className="mt-3 text-sm text-ink/70">{project.insights.health.band_explanation}</p>
            <p className="mt-4 text-sm font-medium">{project.insights.health.intervention}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-5 text-sm">
              {(project.insights.health.factor_rows || Object.entries(project.insights.health.factors).map(([k, v]) => ({ label: k.replaceAll("_", " "), score: v }))).map((row) => (
                <div key={row.label} className="rounded-lg bg-paper p-3">
                  <p className="text-xs text-ink/50">{row.label}</p>
                  <p className="font-serif text-2xl">{row.score}<span className="text-sm text-ink/40"> / 100</span></p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h3 className="font-medium">Why is this project at risk?</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {project.insights.health.reasons.map((r) => (
                <li key={r.text}>• {r.text}</li>
              ))}
              {!project.insights.health.reasons.length ? <li>No material slippage indicators.</li> : null}
            </ul>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="font-medium">Planned vs system-calculated progress</h3>
              <p className="mt-2 text-sm">Expected from original timeline: {project.insights.finance.planned_physical}%</p>
              <p className="text-sm">System-calculated (task average): {project.progress}%</p>
              {project.insights.reported_physical_progress != null ? (
                <p className="text-sm">Reported physical progress: {project.insights.reported_physical_progress}%</p>
              ) : null}
              <p className="mt-1 text-xs text-ink/50">{project.insights.progress_method}</p>
              <div className="mt-3"><ProgressBar value={project.progress} /></div>
            </Card>
            <Card>
              <h3 className="font-medium">Task mix</h3>
              <div className="mx-auto mt-4 h-48 max-w-xs">
                <Doughnut
                  data={{
                    labels: ["To do", "In progress", "Done"],
                    datasets: [{ data: [statusCounts.todo, statusCounts.in_progress, statusCounts.done], backgroundColor: ["#cfc6b6", "#16345c", "#1f6f6a"], borderWidth: 0 }],
                  }}
                  options={{ plugins: { legend: { position: "bottom" } } }}
                />
              </div>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "Finance" ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-4">
            <Card><p className="text-xs text-ink/50 uppercase">Approved / sanctioned</p><p className="font-serif mt-1 text-2xl">₹{project.insights.finance.sanctioned_cost ?? project.insights.finance.original_cost} Cr</p></Card>
            <Card><p className="text-xs text-ink/50 uppercase">Latest anticipated</p><p className="font-serif mt-1 text-2xl">₹{project.insights.finance.anticipated_cost ?? project.insights.finance.revised_cost} Cr</p></Card>
            <Card><p className="text-xs text-ink/50 uppercase">Funds released</p><p className="font-serif mt-1 text-2xl">₹{project.insights.finance.funds_released ?? 0} Cr</p></Card>
            <Card><p className="text-xs text-ink/50 uppercase">Expenditure</p><p className="font-serif mt-1 text-2xl">₹{project.insights.finance.expenditure} Cr</p></Card>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><p className="text-xs text-ink/50 uppercase">Cost overrun</p><p className="font-serif mt-1 text-2xl">{project.insights.finance.cost_overrun_pct}%</p></Card>
            <Card><p className="text-xs text-ink/50 uppercase">Financial progress</p><p className="font-serif mt-1 text-2xl">{project.insights.finance.financial_progress}%</p></Card>
            <Card><p className="text-xs text-ink/50 uppercase">Time overrun</p><p className="font-serif mt-1 text-2xl">{project.insights.finance.time_overrun_days} days</p></Card>
          </div>
          <Card>
          <p className="mt-2 text-sm">Release utilization {project.insights.finance.release_utilization ?? 0}% · Expenditure utilization {project.insights.finance.expenditure_utilization ?? 0}% · Funding gap ₹{project.insights.finance.funding_gap ?? 0} Cr</p>
            {Math.abs(project.insights.finance.physical_financial_mismatch || 0) >= 15 ? (
              <p className="mt-2 text-sm font-medium text-accent">Physical-Financial Mismatch ({project.insights.finance.physical_financial_mismatch} pts: financial {project.insights.finance.financial_progress}% vs system-calculated physical {project.progress}%)</p>
            ) : (
              <p className="mt-2 text-sm">Physical vs financial gap {project.insights.finance.physical_financial_mismatch ?? 0} pts</p>
            )}
            <p className="mt-2 text-sm">Expected expenditure ₹{project.insights.finance.expected_expenditure} Cr · Actual ₹{project.insights.finance.expenditure} Cr · Variance ₹{project.insights.finance.expenditure_variance} Cr</p>
            <p className="mt-2 text-sm text-ink/60">Original completion {project.insights.finance.original_end} · Revised {project.insights.finance.revised_end}</p>
          </Card>
          {canManage ? (
            <Card>
              <h3 className="font-medium">Update financials & delay reason</h3>
              <form
                className="mt-3 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  api(`/api/projects/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                      ...project,
                      original_cost: fd.get("original_cost"),
                      revised_cost: fd.get("revised_cost"),
                      expenditure: fd.get("expenditure"),
                      funds_released: fd.get("funds_released"),
                      original_end_date: fd.get("original_end_date"),
                      revised_end_date: fd.get("revised_end_date"),
                      delay_reason: fd.get("delay_reason"),
                      delay_notes: fd.get("delay_notes"),
                      reported_physical_progress: fd.get("reported_physical_progress"),
                    }),
                  }).then(load).catch((err) => setError(err.message));
                }}
              >
                <Field label="Original cost (₹ Cr)"><input name="original_cost" type="number" step="0.01" defaultValue={project.original_cost} className={inputClass} /></Field>
                <Field label="Revised cost (₹ Cr)"><input name="revised_cost" type="number" step="0.01" defaultValue={project.revised_cost} className={inputClass} /></Field>
                <Field label="Expenditure (₹ Cr)"><input name="expenditure" type="number" step="0.01" defaultValue={project.expenditure} className={inputClass} /></Field>
                <Field label="Funds released (₹ Cr)"><input name="funds_released" type="number" step="0.01" defaultValue={project.funds_released ?? 0} className={inputClass} /></Field>
                <Field label="Reported physical progress (%)"><input name="reported_physical_progress" type="number" step="0.1" min="0" max="100" defaultValue={project.reported_physical_progress ?? ""} className={inputClass} /></Field>
                <Field label="Original completion"><input name="original_end_date" type="date" defaultValue={project.original_end_date || project.end_date} className={inputClass} /></Field>
                <Field label="Revised completion"><input name="revised_end_date" type="date" defaultValue={project.revised_end_date || project.end_date} className={inputClass} /></Field>
                <Field label="Reason for delay">
                  <select name="delay_reason" defaultValue={project.delay_reason || ""} className={inputClass}>
                    <option value="">None recorded</option>
                    {meta.delay_reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </Field>
                <div className="md:col-span-2">
                  <Field label="Additional explanation"><textarea name="delay_notes" defaultValue={project.delay_notes} className={inputClass} rows={2} /></Field>
                </div>
                {error ? <p className="text-sm text-accent md:col-span-2">{error}</p> : null}
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Save financials</button>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "Pre-construction" ? (
        <div className="space-y-4">
          <p className="text-sm text-ink/60">Clearances feed the current-health engine and the prototype forecast. This does not replace milestones.</p>
          {canManage ? (
            <Card>
              <h3 className="font-medium">Add clearance / approval</h3>
              <form
                className="mt-3 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  api(`/api/projects/${id}/preconstructions`, { method: "POST", body: JSON.stringify(preconForm) }).then(() => {
                    setPreconForm({ name: "", category: "environmental_clearance", status: "not_started", planned_completion: "", authority: "", remarks: "" });
                    load();
                  }).catch((err) => setError(err.message));
                }}
              >
                <Field label="Name"><input className={inputClass} value={preconForm.name} onChange={(e) => setPreconForm({ ...preconForm, name: e.target.value })} required /></Field>
                <Field label="Category">
                  <select className={inputClass} value={preconForm.category} onChange={(e) => setPreconForm({ ...preconForm, category: e.target.value })}>
                    {(meta.precon_categories || []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select className={inputClass} value={preconForm.status} onChange={(e) => setPreconForm({ ...preconForm, status: e.target.value })}>
                    {(meta.precon_statuses || []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Planned completion"><input type="date" className={inputClass} value={preconForm.planned_completion} onChange={(e) => setPreconForm({ ...preconForm, planned_completion: e.target.value })} /></Field>
                <Field label="Authority"><input className={inputClass} value={preconForm.authority} onChange={(e) => setPreconForm({ ...preconForm, authority: e.target.value })} /></Field>
                <Field label="Remarks"><input className={inputClass} value={preconForm.remarks} onChange={(e) => setPreconForm({ ...preconForm, remarks: e.target.value })} /></Field>
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Save</button>
              </form>
            </Card>
          ) : null}
          {(project.preconstructions || []).map((c) => (
            <Card key={c.id} className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{c.name}</p>
                <p className="text-sm text-ink/60">{c.authority} · planned {c.planned_completion || "—"}</p>
                <p className="text-sm">{c.remarks}</p>
              </div>
              {canManage ? (
                <select
                  className="rounded border border-sand px-2 py-1 text-sm"
                  value={c.status}
                  onChange={(e) => api(`/api/preconstructions/${c.id}`, { method: "PUT", body: JSON.stringify({ ...c, status: e.target.value }) }).then(load)}
                >
                  {(meta.precon_statuses || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              ) : (
                <StatusPill status={c.status} />
              )}
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "Lifecycle" ? (
        <div className="space-y-4">
          <p className="text-sm text-ink/60">Tender, award and work-order fields are monitoring metadata. They do not run procurement.</p>
          {(project.lifecycle_stages || []).map((s) => (
            <Card key={s.stage_key} className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{s.stage_key.replaceAll("_", " ")}</p>
                <p className="text-sm text-ink/60">Planned {s.planned_date || "—"} · actual {s.actual_date || "—"}</p>
                <p className="text-sm">{s.remarks}</p>
                {s.delay_reason ? <p className="text-sm text-accent">{s.delay_reason}</p> : null}
              </div>
              {canManage ? (
                <select
                  className="rounded border border-sand px-2 py-1 text-sm"
                  value={s.status}
                  onChange={(e) =>
                    api(`/api/projects/${id}/lifecycle/${s.stage_key}`, {
                      method: "PUT",
                      body: JSON.stringify({ ...s, status: e.target.value }),
                    }).then(load).catch((err) => setError(err.message))
                  }
                >
                  {(meta.lifecycle_statuses || []).map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                </select>
              ) : (
                <StatusPill status={s.status} />
              )}
            </Card>
          ))}
          {canManage ? (
            <Card>
              <h3 className="font-medium">Tender / award / work order / commencement / supervision</h3>
              <form
                className="mt-3 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  api(`/api/projects/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                      ...project,
                      tender_status: fd.get("tender_status"),
                      tender_document_date: fd.get("tender_document_date"),
                      tender_publication_date: fd.get("tender_publication_date"),
                      bid_deadline: fd.get("bid_deadline"),
                      evaluation_date: fd.get("evaluation_date"),
                      tender_award_date: fd.get("tender_award_date"),
                      contracting_agency: fd.get("contracting_agency"),
                      tender_contract_value: fd.get("tender_contract_value"),
                      tender_remarks: fd.get("tender_remarks"),
                      tender_delay_reason: fd.get("tender_delay_reason"),
                      award_date: fd.get("award_date"),
                      awarded_agency: fd.get("awarded_agency"),
                      award_contract_value: fd.get("award_contract_value"),
                      award_planned_commencement: fd.get("award_planned_commencement"),
                      award_remarks: fd.get("award_remarks"),
                      work_order_issued: fd.get("work_order_issued") === "on" ? 1 : 0,
                      work_order_number: fd.get("work_order_number"),
                      work_order_date: fd.get("work_order_date"),
                      contract_reference: fd.get("contract_reference"),
                      executing_agency: fd.get("executing_agency"),
                      planned_commencement_date: fd.get("planned_commencement_date"),
                      actual_commencement_date: fd.get("actual_commencement_date"),
                      commencement_status: fd.get("commencement_status"),
                      commencement_delay_reason: fd.get("commencement_delay_reason"),
                      commencement_remarks: fd.get("commencement_remarks"),
                      supervision_type: fd.get("supervision_type"),
                      supervising_org: fd.get("supervising_org"),
                      supervising_person: fd.get("supervising_person"),
                      supervision_remarks: fd.get("supervision_remarks"),
                    }),
                  }).then(load).catch((err) => setError(err.message));
                }}
              >
                <Field label="Tender status">
                  <select name="tender_status" defaultValue={project.tender_status || "not_started"} className={inputClass}>
                    {(meta.tender_statuses || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Tender publication"><input name="tender_publication_date" type="date" defaultValue={project.tender_publication_date || ""} className={inputClass} /></Field>
                <Field label="Bid deadline"><input name="bid_deadline" type="date" defaultValue={project.bid_deadline || ""} className={inputClass} /></Field>
                <Field label="Award date"><input name="award_date" type="date" defaultValue={project.award_date || project.tender_award_date || ""} className={inputClass} /></Field>
                <Field label="Awarded agency"><input name="awarded_agency" defaultValue={project.awarded_agency || ""} className={inputClass} /></Field>
                <Field label="Contract value (₹ Cr)"><input name="award_contract_value" type="number" step="0.01" defaultValue={project.award_contract_value || project.tender_contract_value || 0} className={inputClass} /></Field>
                <Field label="Work order number"><input name="work_order_number" defaultValue={project.work_order_number || ""} className={inputClass} /></Field>
                <Field label="Work order date"><input name="work_order_date" type="date" defaultValue={project.work_order_date || ""} className={inputClass} /></Field>
                <label className="flex items-center gap-2 text-sm md:col-span-2">
                  <input name="work_order_issued" type="checkbox" defaultChecked={Boolean(project.work_order_issued)} /> Work order issued
                </label>
                <Field label="Planned commencement"><input name="planned_commencement_date" type="date" defaultValue={project.planned_commencement_date || ""} className={inputClass} /></Field>
                <Field label="Actual commencement"><input name="actual_commencement_date" type="date" defaultValue={project.actual_commencement_date || ""} className={inputClass} /></Field>
                <Field label="Commencement status">
                  <select name="commencement_status" defaultValue={project.commencement_status || "not_started"} className={inputClass}>
                    {(meta.lifecycle_statuses || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Commencement delay reason"><input name="commencement_delay_reason" defaultValue={project.commencement_delay_reason || ""} className={inputClass} /></Field>
                <Field label="Supervision type">
                  <select name="supervision_type" defaultValue={project.supervision_type || ""} className={inputClass}>
                    <option value="">Not recorded</option>
                    {(meta.supervision_types || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Supervising organisation"><input name="supervising_org" defaultValue={project.supervising_org || ""} className={inputClass} /></Field>
                <Field label="Responsible person"><input name="supervising_person" defaultValue={project.supervising_person || ""} className={inputClass} /></Field>
                <input type="hidden" name="tender_document_date" defaultValue={project.tender_document_date || ""} />
                <input type="hidden" name="evaluation_date" defaultValue={project.evaluation_date || ""} />
                <input type="hidden" name="tender_award_date" defaultValue={project.tender_award_date || ""} />
                <input type="hidden" name="contracting_agency" defaultValue={project.contracting_agency || ""} />
                <input type="hidden" name="tender_contract_value" defaultValue={project.tender_contract_value || 0} />
                <input type="hidden" name="tender_remarks" defaultValue={project.tender_remarks || ""} />
                <input type="hidden" name="tender_delay_reason" defaultValue={project.tender_delay_reason || ""} />
                <input type="hidden" name="award_planned_commencement" defaultValue={project.award_planned_commencement || ""} />
                <input type="hidden" name="award_remarks" defaultValue={project.award_remarks || ""} />
                <input type="hidden" name="contract_reference" defaultValue={project.contract_reference || ""} />
                <input type="hidden" name="executing_agency" defaultValue={project.executing_agency || ""} />
                <input type="hidden" name="commencement_remarks" defaultValue={project.commencement_remarks || ""} />
                <input type="hidden" name="supervision_remarks" defaultValue={project.supervision_remarks || ""} />
                {project.commencement_delay_days > 0 ? <p className="md:col-span-2 text-sm font-medium">{project.commencement_delay_days} days commencement delay</p> : null}
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Save lifecycle metadata</button>
              </form>
            </Card>
          ) : (
            <Card>
              <p className="text-sm">Tender: {project.tender_status || "—"} · Awarded agency: {project.awarded_agency || "—"} · Work order: {project.work_order_number || "not issued"}</p>
              <p className="mt-2 text-sm">Supervision: {(project.supervision_type || "").replaceAll("_", " ") || "—"} · {project.supervising_org || ""}</p>
            </Card>
          )}
        </div>
      ) : null}

      {tab === "Resources" ? (
        <div className="space-y-4">
          <p className="text-sm text-ink/60">Resource readiness for execution — not an ERP inventory system.</p>
          {(project.resources || []).map((r) => (
            <Card key={r.category} className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{r.category.replaceAll("_", " ")}</p>
                <p className="text-sm text-ink/60">{r.responsible || "—"} · expected {r.expected_date || "—"}</p>
                <p className="text-sm">{r.remarks}</p>
                {r.delay_reason ? <p className="text-sm text-accent">{r.delay_reason}</p> : null}
              </div>
              {canManage ? (
                <select
                  className="rounded border border-sand px-2 py-1 text-sm"
                  value={r.status}
                  onChange={(e) =>
                    api(`/api/projects/${id}/resources/${r.category}`, {
                      method: "PUT",
                      body: JSON.stringify({ ...r, status: e.target.value }),
                    }).then(load).catch((err) => setError(err.message))
                  }
                >
                  {(meta.resource_statuses || []).map((st) => <option key={st.id} value={st.id}>{st.label}</option>)}
                </select>
              ) : (
                <StatusPill status={r.status} />
              )}
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "Testing" ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <p className="text-xs uppercase text-ink/50">Testing</p>
              <StatusPill status={project.testing_status} />
              <p className="mt-2 text-sm">Planned {project.testing_planned || "—"} · actual {project.testing_actual || "—"}</p>
              <p className="text-sm">{project.testing_remarks}</p>
              {project.testing_issues ? <p className="text-sm text-accent">{project.testing_issues}</p> : null}
            </Card>
            <Card>
              <p className="text-xs uppercase text-ink/50">Commissioning</p>
              <StatusPill status={project.commissioning_status} />
              <p className="mt-2 text-sm">Planned {project.commissioning_planned || "—"} · actual {project.commissioning_actual || "—"}</p>
              <p className="text-sm">{project.commissioning_remarks}</p>
              {project.commissioning_outstanding ? <p className="text-sm text-accent">{project.commissioning_outstanding}</p> : null}
            </Card>
            <Card>
              <p className="text-xs uppercase text-ink/50">Handover</p>
              <StatusPill status={project.handover_status} />
              <p className="mt-2 text-sm">Receiving agency: {project.receiving_agency || "—"}</p>
              <p className="text-sm">Planned {project.handover_planned || "—"} · actual {project.handover_actual || "—"}</p>
              <p className="text-sm">{project.handover_remarks}</p>
              {project.completion_certificate_status ? <p className="text-sm">Certificate: {project.completion_certificate_status}</p> : null}
            </Card>
          </div>
          {canManage ? (
            <Card>
              <h3 className="font-medium">Update testing / commissioning / handover</h3>
              <form
                className="mt-3 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.target);
                  api(`/api/projects/${id}`, {
                    method: "PUT",
                    body: JSON.stringify({
                      ...project,
                      testing_status: fd.get("testing_status"),
                      testing_planned: fd.get("testing_planned"),
                      testing_actual: fd.get("testing_actual"),
                      testing_remarks: fd.get("testing_remarks"),
                      testing_issues: fd.get("testing_issues"),
                      commissioning_status: fd.get("commissioning_status"),
                      commissioning_planned: fd.get("commissioning_planned"),
                      commissioning_actual: fd.get("commissioning_actual"),
                      commissioning_remarks: fd.get("commissioning_remarks"),
                      commissioning_outstanding: fd.get("commissioning_outstanding"),
                      handover_status: fd.get("handover_status"),
                      handover_planned: fd.get("handover_planned"),
                      handover_actual: fd.get("handover_actual"),
                      receiving_agency: fd.get("receiving_agency"),
                      handover_remarks: fd.get("handover_remarks"),
                      handover_defects: fd.get("handover_defects"),
                      completion_certificate_status: fd.get("completion_certificate_status"),
                    }),
                  }).then(load).catch((err) => setError(err.message));
                }}
              >
                <Field label="Testing status">
                  <select name="testing_status" defaultValue={project.testing_status || "not_started"} className={inputClass}>
                    {(meta.lifecycle_statuses || []).filter((s) => s.id !== "not_applicable").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Planned testing"><input name="testing_planned" type="date" defaultValue={project.testing_planned || ""} className={inputClass} /></Field>
                <Field label="Actual testing"><input name="testing_actual" type="date" defaultValue={project.testing_actual || ""} className={inputClass} /></Field>
                <Field label="Testing remarks"><input name="testing_remarks" defaultValue={project.testing_remarks || ""} className={inputClass} /></Field>
                <Field label="Issues found"><input name="testing_issues" defaultValue={project.testing_issues || ""} className={inputClass} /></Field>
                <Field label="Commissioning status">
                  <select name="commissioning_status" defaultValue={project.commissioning_status || "not_started"} className={inputClass}>
                    {(meta.lifecycle_statuses || []).filter((s) => s.id !== "not_applicable").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Planned commissioning"><input name="commissioning_planned" type="date" defaultValue={project.commissioning_planned || ""} className={inputClass} /></Field>
                <Field label="Actual commissioning"><input name="commissioning_actual" type="date" defaultValue={project.commissioning_actual || ""} className={inputClass} /></Field>
                <Field label="Outstanding issues"><input name="commissioning_outstanding" defaultValue={project.commissioning_outstanding || ""} className={inputClass} /></Field>
                <Field label="Handover status">
                  <select name="handover_status" defaultValue={project.handover_status || "not_started"} className={inputClass}>
                    {(meta.lifecycle_statuses || []).filter((s) => s.id !== "not_applicable").map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </Field>
                <Field label="Receiving agency"><input name="receiving_agency" defaultValue={project.receiving_agency || ""} className={inputClass} /></Field>
                <Field label="Planned handover"><input name="handover_planned" type="date" defaultValue={project.handover_planned || ""} className={inputClass} /></Field>
                <Field label="Actual handover"><input name="handover_actual" type="date" defaultValue={project.handover_actual || ""} className={inputClass} /></Field>
                <Field label="Handover remarks"><input name="handover_remarks" defaultValue={project.handover_remarks || ""} className={inputClass} /></Field>
                <Field label="Outstanding defects"><input name="handover_defects" defaultValue={project.handover_defects || ""} className={inputClass} /></Field>
                <Field label="Completion certificate"><input name="completion_certificate_status" defaultValue={project.completion_certificate_status || ""} className={inputClass} /></Field>
                <input type="hidden" name="commissioning_remarks" defaultValue={project.commissioning_remarks || ""} />
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Save close-out stages</button>
              </form>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "Issues" ? (
        <div className="space-y-4">
          {canManage ? (
            <Card>
              <h3 className="font-medium">Log a bottleneck</h3>
              <form
                className="mt-3 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  api(`/api/projects/${id}/issues`, { method: "POST", body: JSON.stringify(issueForm) }).then(() => {
                    setIssueForm({ title: "", category: "procurement", severity: "high", owner: "", intervention: "", due_date: "" });
                    load();
                  });
                }}
              >
                <Field label="Issue"><input className={inputClass} value={issueForm.title} onChange={(e) => setIssueForm({ ...issueForm, title: e.target.value })} required /></Field>
                <Field label="Category">
                  <select className={inputClass} value={issueForm.category} onChange={(e) => setIssueForm({ ...issueForm, category: e.target.value })}>
                    {meta.delay_reasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </Field>
                <Field label="Severity">
                  <select className={inputClass} value={issueForm.severity} onChange={(e) => setIssueForm({ ...issueForm, severity: e.target.value })}>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <Field label="Owner / ministry"><input className={inputClass} value={issueForm.owner} onChange={(e) => setIssueForm({ ...issueForm, owner: e.target.value })} /></Field>
                <Field label="Required intervention"><input className={inputClass} value={issueForm.intervention} onChange={(e) => setIssueForm({ ...issueForm, intervention: e.target.value })} /></Field>
                <Field label="Deadline"><input type="date" className={inputClass} value={issueForm.due_date} onChange={(e) => setIssueForm({ ...issueForm, due_date: e.target.value })} /></Field>
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Save issue</button>
              </form>
            </Card>
          ) : null}
          {(project.issues || []).map((issue) => (
            <Card key={issue.id} className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{issue.title}</p>
                <p className="text-sm text-ink/60">{issue.owner} · due {issue.due_date || "—"}</p>
                <p className="mt-1 text-sm">{issue.intervention}</p>
                {issue.suggested_category ? (
                  <p className="mt-2 text-xs text-ink/55">
                    NLP suggestion: {issue.suggested_category} ({issue.nlp_confidence != null ? Math.round(issue.nlp_confidence * 100) : "—"}%)
                    {issue.nlp_accepted_category ? ` · accepted as ${issue.nlp_accepted_category}` : " · not applied until accepted"}
                    {canManage && issue.suggested_category !== issue.category ? (
                      <button
                        className="ml-2 text-navy underline"
                        type="button"
                        onClick={() =>
                          api(`/api/issues/${issue.id}`, {
                            method: "PUT",
                            body: JSON.stringify({ ...issue, nlp_accepted_category: issue.suggested_category, category: issue.suggested_category }),
                          }).then(load)
                        }
                      >
                        Accept suggestion
                      </button>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={issue.severity} />
                {canManage ? (
                  <select className="rounded border border-sand px-2 py-1 text-sm" value={issue.status} onChange={(e) => api(`/api/issues/${issue.id}`, { method: "PUT", body: JSON.stringify({ ...issue, status: e.target.value }) }).then(load)}>
                    <option value="open">Open</option>
                    <option value="in_progress">In progress</option>
                    <option value="resolved">Resolved</option>
                  </select>
                ) : (
                  <StatusPill status={issue.status} />
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "Interventions" ? (
        <div className="space-y-4">
          {canManage ? (
            <Card>
              <h3 className="font-medium">Create intervention</h3>
              <form
                className="mt-3 grid gap-3 md:grid-cols-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  api(`/api/projects/${id}/interventions`, { method: "POST", body: JSON.stringify(ivForm) }).then(() => {
                    setIvForm({ action: "", authority: "", assigned_officer: "", due_date: "", priority: "high" });
                    load();
                  });
                }}
              >
                <div className="md:col-span-2">
                  <Field label="Action required"><input className={inputClass} value={ivForm.action} onChange={(e) => setIvForm({ ...ivForm, action: e.target.value })} required /></Field>
                </div>
                <Field label="Responsible authority"><input className={inputClass} value={ivForm.authority} onChange={(e) => setIvForm({ ...ivForm, authority: e.target.value })} /></Field>
                <Field label="Assigned officer"><input className={inputClass} value={ivForm.assigned_officer} onChange={(e) => setIvForm({ ...ivForm, assigned_officer: e.target.value })} /></Field>
                <Field label="Target resolution"><input type="date" className={inputClass} value={ivForm.due_date} onChange={(e) => setIvForm({ ...ivForm, due_date: e.target.value })} /></Field>
                <Field label="Priority">
                  <select className={inputClass} value={ivForm.priority} onChange={(e) => setIvForm({ ...ivForm, priority: e.target.value })}>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="critical">Critical</option>
                  </select>
                </Field>
                <button className="rounded-md bg-navy px-4 py-2 text-sm text-white" type="submit">Assign intervention</button>
              </form>
            </Card>
          ) : null}
          {(project.interventions || []).map((iv) => (
            <Card key={iv.id} className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{iv.action}</p>
                <p className="text-sm text-ink/60">{iv.authority} · {iv.assigned_officer} · {iv.due_date || "no date"}</p>
              </div>
              {canManage ? (
                <select className="rounded border border-sand px-2 py-1 text-sm" value={iv.status} onChange={(e) => api(`/api/interventions/${iv.id}`, { method: "PUT", body: JSON.stringify({ ...iv, status: e.target.value }) }).then(load)}>
                  <option value="open">Open</option>
                  <option value="in_progress">In progress</option>
                  <option value="resolved">Resolved</option>
                </select>
              ) : (
                <StatusPill status={iv.status} />
              )}
            </Card>
          ))}
        </div>
      ) : null}

      {tab === "Audit" ? (
        <Card>
          <h3 className="font-medium">Activity log</h3>
          <ul className="mt-3 divide-y divide-sand text-sm">
            {(project.audit || []).map((a) => (
              <li key={a.id} className="py-2">
                <p className="font-medium">{a.actor_name} · {a.action}</p>
                <p className="text-ink/50">{new Date(a.created_at).toLocaleString()} · {a.detail}</p>
                {a.prev_value || a.new_value ? (
                  <p className="text-xs text-ink/40">Previous: {a.prev_value || "—"} → New: {a.new_value || "—"}</p>
                ) : null}
              </li>
            ))}
            {!project.audit?.length ? <li className="py-2 text-ink/50">No recorded changes yet.</li> : null}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
