import { delayLabel } from "./constants.js";
import { classifyFromIssue, classifyBottleneck } from "./nlp.js";

export function buildOutlook({ insights, forecast, issues = [], interventions = [], preconstructions = [], project }) {
  const openIssues = issues.filter((i) => i.status !== "resolved");
  const nlpSources = openIssues.length
    ? openIssues.map((i) => classifyFromIssue(i))
    : project?.delay_notes
      ? [classifyBottleneck(project.delay_notes)]
      : [];
  const topNlp = nlpSources.sort((a, b) => b.confidence - a.confidence)[0] || null;
  const delayedClearances = preconstructions.filter((c) => c.status === "delayed" || c.status === "blocked");
  const openIv = interventions.filter((i) => i.status !== "resolved");
  const why = [
    ...(insights.health?.reasons || []).slice(0, 4).map((r) => r.text),
    ...delayedClearances.slice(0, 2).map((c) => `Pre-construction: ${c.name} is ${c.status}.`),
    ...(forecast?.drivers || []).slice(0, 2),
  ].filter(Boolean);
  const uniqueWhy = [...new Set(why)].slice(0, 6);

  return {
    current_health: insights.health?.band,
    current_score: insights.health?.score,
    forecast_schedule_risk: forecast?.schedule_risk,
    estimated_delay_days: forecast?.estimated_slippage_days,
    estimated_completion: forecast?.estimated_completion,
    why: uniqueWhy,
    bottleneck: topNlp
      ? {
          category: topNlp.category,
          label: topNlp.label,
          confidence: topNlp.confidence,
          confidence_band: topNlp.confidence_band,
          explanation: topNlp.explanation,
          source: "AI-assisted classification on issue/delay text (synthetic-trained prototype). Manual category stays authoritative until accepted.",
        }
      : project?.delay_reason
        ? {
            category: project.delay_reason,
            label: delayLabel(project.delay_reason),
            confidence: null,
            confidence_band: "manual",
            explanation: "Officer-recorded delay reason. No NLP suggestion was generated.",
            source: "manual",
          }
        : null,
    open_intervention: openIv[0]
      ? { id: openIv[0].id, action: openIv[0].action, status: openIv[0].status, due_date: openIv[0].due_date }
      : null,
    recommended_action: insights.health?.intervention,
    disclaimer:
      "Current health is rule-based. Forecast is a prototype trajectory. NLP categories are suggestions from a synthetic-trained classifier. None of these are official PAIMANA statistics.",
  };
}
