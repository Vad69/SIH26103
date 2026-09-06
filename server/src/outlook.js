import { delayLabel } from "./constants.js";
import { classifyFromIssue, classifyBottleneck } from "./nlp.js";
import {
  blockedResources,
  currentStage,
  delayedLifecycleStages,
  lifecycleLabel,
  RESOURCE_CATEGORIES,
} from "./lifecycle.js";

function resourceCatLabel(cat) {
  return RESOURCE_CATEGORIES.find((c) => c.id === cat)?.label || String(cat || "").replaceAll("_", " ");
}

function severityRank(status) {
  if (status === "blocked") return 2;
  if (status === "delayed") return 1;
  return 0;
}

/**
 * Authoritative current-state explanation from observed project evidence.
 * Does not consult the NLP classifier.
 */
export function primaryRiskDriver({
  insights,
  project,
  resources = [],
  preconstructions = [],
  lifecycle_stages = [],
}) {
  const reasons = insights?.health?.reasons || [];
  const blocked = [...blockedResources(resources)].sort((a, b) => {
    const score = (r) => severityRank(r.status) * 10 + (r.category === "site_readiness" ? 1 : 0);
    return score(b) - score(a);
  });
  const delayedClearances = preconstructions.filter((c) => c.status === "delayed" || c.status === "blocked");
  const delayedStages = delayedLifecycleStages(lifecycle_stages);

  if (blocked.length) {
    const r = blocked[0];
    const matching = reasons.find((x) => /resource/i.test(x.text));
    return {
      kind: "observed",
      field: "resources",
      category: r.category,
      status: r.status,
      label: `${resourceCatLabel(r.category)} (${r.status})`,
      text: matching?.text || `${resourceCatLabel(r.category)} is ${r.status}`,
      source: "deterministic_health_evidence",
      advisory: false,
    };
  }
  if (delayedClearances.length) {
    const c = delayedClearances[0];
    const matching = reasons.find((x) => /pre-construction/i.test(x.text));
    return {
      kind: "observed",
      field: "clearances",
      category: c.category || "preconstruction",
      status: c.status,
      label: `${c.name} (${c.status})`,
      text: matching?.text || `Pre-construction: ${c.name} is ${c.status}.`,
      source: "deterministic_health_evidence",
      advisory: false,
    };
  }
  if (delayedStages.length) {
    const s = delayedStages[0];
    const matching = reasons.find((x) => /lifecycle/i.test(x.text));
    return {
      kind: "observed",
      field: "lifecycle",
      category: s.stage_key,
      status: s.status,
      label: `${lifecycleLabel(s.stage_key)} (${s.status})`,
      text: matching?.text || `${lifecycleLabel(s.stage_key)} is ${s.status}`,
      source: "deterministic_health_evidence",
      advisory: false,
    };
  }
  const ranked = [...reasons].sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return (rank[b.severity] || 0) - (rank[a.severity] || 0);
  });
  if (ranked[0]) {
    return {
      kind: "analysis",
      field: "health",
      category: project?.delay_reason || null,
      label: ranked[0].text,
      text: ranked[0].text,
      source: "deterministic_health_evidence",
      advisory: false,
    };
  }
  if (project?.delay_reason) {
    return {
      kind: "observed",
      field: "delay_reason",
      category: project.delay_reason,
      label: delayLabel(project.delay_reason),
      text: `Recorded delay reason: ${delayLabel(project.delay_reason)}`,
      source: "officer_recorded",
      advisory: false,
    };
  }
  return null;
}

function advisoryNlp(topNlp) {
  if (!topNlp || !topNlp.confidence) return null;
  return {
    category: topNlp.category,
    label: topNlp.label,
    confidence: topNlp.confidence,
    confidence_band: topNlp.confidence_band,
    explanation: topNlp.explanation,
    version: topNlp.version,
    advisory: true,
    role: "advisory",
    source:
      "NLP-assisted bottleneck suggestion (synthetic-trained prototype). Advisory only — does not set health score, health band, or the primary risk driver.",
  };
}

export function buildOutlook({
  insights,
  forecast,
  issues = [],
  interventions = [],
  preconstructions = [],
  lifecycle_stages = [],
  resources = [],
  project,
}) {
  const openIssues = issues.filter((i) => i.status !== "resolved");
  const extraTexts = [
    ...blockedResources(resources).map((r) => [r.delay_reason, r.remarks, r.category].filter(Boolean).join(" ")),
    ...delayedLifecycleStages(lifecycle_stages).map((s) => [s.delay_reason, s.remarks].filter(Boolean).join(" ")),
  ].filter((t) => t && t.trim());
  const nlpSources = [
    ...openIssues.map((i) => classifyFromIssue(i)),
    ...extraTexts.map((t) => classifyBottleneck(t)),
    ...(project?.delay_notes ? [classifyBottleneck(project.delay_notes)] : []),
  ];
  const topNlp = nlpSources.sort((a, b) => b.confidence - a.confidence)[0] || null;
  const delayedClearances = preconstructions.filter((c) => c.status === "delayed" || c.status === "blocked");
  const openIv = interventions.filter((i) => i.status !== "resolved" && i.status !== "cancelled");
  const stage = currentStage(lifecycle_stages);
  const driver = primaryRiskDriver({
    insights,
    project,
    resources,
    preconstructions,
    lifecycle_stages,
  });
  const nlp_suggestion = advisoryNlp(topNlp);
  const why = [
    driver?.text,
    ...(insights.health?.reasons || []).slice(0, 4).map((r) => r.text),
    ...delayedClearances.slice(0, 2).map((c) => `Pre-construction: ${c.name} is ${c.status}.`),
  ].filter(Boolean);
  const uniqueWhy = [...new Set(why)].slice(0, 6);
  const physical = insights.progress;
  const financial = insights.finance?.financial_progress;
  const mismatch =
    financial != null && physical != null && Math.abs(financial - physical) >= 15
      ? "Physical-Financial Mismatch"
      : null;

  return {
    current_stage: stage?.stage_key || "",
    current_stage_label: stage ? lifecycleLabel(stage.stage_key) : "",
    current_health: insights.health?.band,
    current_score: insights.health?.score,
    forecast_schedule_risk: forecast?.schedule_risk,
    estimated_delay_days: forecast?.estimated_slippage_days,
    estimated_completion: forecast?.estimated_completion,
    physical_progress: physical,
    financial_progress: financial,
    mismatch,
    why: uniqueWhy,
    primary_driver: driver,
    nlp_suggestion,
    // Compat: "bottleneck" is the deterministic primary driver, not the NLP class.
    bottleneck: driver,
    open_intervention: openIv[0]
      ? { id: openIv[0].id, action: openIv[0].action, status: openIv[0].status, due_date: openIv[0].due_date }
      : null,
    recommended_action: insights.health?.intervention,
    disclaimer:
      "Current health is rule-based. The primary risk driver comes from observed project evidence (health reasons, resources, clearances, lifecycle). Forecast is a prototype trajectory. NLP categories are advisory suggestions from a synthetic-trained classifier and do not set the health score, band, or primary driver. None of these are official PAIMANA statistics.",
  };
}
