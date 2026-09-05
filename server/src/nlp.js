/**
 * Prototype bottleneck classifier (multinomial Naive Bayes).
 * Trained only on synthetic labelled phrases — not MoSPI/PAIMANA data.
 */
import { DELAY_REASONS, delayLabel } from "./constants.js";

export const NLP_VERSION = "pragati-nb-v1-synthetic";

const SYNTHETIC = [
  ["land_acquisition", "land acquisition not completed and site cannot be handed over"],
  ["land_acquisition", "farmers have not accepted compensation for acquired parcels"],
  ["land_acquisition", "mutation of land records is pending with the district collector"],
  ["environmental_clearance", "environmental approval has not arrived and construction cannot proceed"],
  ["environmental_clearance", "EC from the expert appraisal committee is still pending"],
  ["environmental_clearance", "environment clearance delayed so earthwork is on hold"],
  ["environmental_clearance", "forest clearance and wildlife NOC not received"],
  ["funding", "funds have not been released and bills cannot be paid"],
  ["funding", "budget allocation is short and payment to the agency is stuck"],
  ["funding", "utilization certificate pending so next tranche is withheld"],
  ["procurement", "tender has slipped two cycles and tablets are not issued"],
  ["procurement", "bid evaluation is delayed and the contract is not awarded"],
  ["procurement", "GeM-style procurement of equipment is still under tender"],
  ["contractor", "the implementing agency has demobilized from site"],
  ["contractor", "contractor performance is poor and workfront is idle"],
  ["contractor", "agency has not deployed enough skilled manpower"],
  ["utility_shifting", "electric poles and water lines have not been shifted"],
  ["utility_shifting", "utility shifting by the discom is blocking the alignment"],
  ["coordination", "source ministries have not signed the data-sharing SLA"],
  ["coordination", "inter-ministerial coordination meeting did not take a decision"],
  ["legal", "stay order from the high court has halted the package"],
  ["legal", "legal approval and statutory NOC are still pending"],
  ["law_order", "local protests and law and order issues stopped the survey team"],
  ["law_order", "bandh and unrest in the district delayed field work"],
  ["equipment", "tablets and SIM cards have not reached enumerators"],
  ["equipment", "material supply of sensors is delayed from the vendor"],
  ["design", "DPR drawings are incomplete and the technical design is not frozen"],
  ["design", "scope change requires a revised technical specification"],
  ["disaster", "floods washed out the access road to the site"],
  ["disaster", "cyclone damage delayed the field round"],
  ["other", "miscellaneous administrative delay without a coded reason"],
];

function tokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3);
}

function train(examples) {
  const docs = {};
  const tf = {};
  const vocab = new Set();
  for (const [label, text] of examples) {
    docs[label] = (docs[label] || 0) + 1;
    tf[label] = tf[label] || {};
    for (const t of tokens(text)) {
      vocab.add(t);
      tf[label][t] = (tf[label][t] || 0) + 1;
    }
  }
  const totalDocs = examples.length;
  const labels = Object.keys(docs);
  const vocabSize = vocab.size;
  const totals = {};
  for (const label of labels) {
    totals[label] = Object.values(tf[label]).reduce((s, n) => s + n, 0);
  }
  return { docs, tf, totals, labels, totalDocs, vocabSize };
}

const MODEL = train(SYNTHETIC);

export function classifyBottleneck(text) {
  const words = tokens(text);
  if (!words.length) {
    return {
      category: "other",
      label: delayLabel("other"),
      confidence: 0,
      confidence_band: "low",
      explanation: "No usable text. Manual category remains authoritative.",
      indicators: [],
      version: NLP_VERSION,
      training: "synthetic_prototype",
    };
  }
  const scores = {};
  for (const label of MODEL.labels) {
    let logp = Math.log((MODEL.docs[label] + 1) / (MODEL.totalDocs + MODEL.labels.length));
    for (const w of words) {
      const c = MODEL.tf[label][w] || 0;
      logp += Math.log((c + 1) / (MODEL.totals[label] + MODEL.vocabSize));
    }
    scores[label] = logp;
  }
  const ranked = MODEL.labels
    .map((label) => ({ label, logp: scores[label] }))
    .sort((a, b) => b.logp - a.logp);
  const best = ranked[0];
  const second = ranked[1];
  const margin = best.logp - (second?.logp ?? best.logp - 1);
  const confidence = Math.max(0.35, Math.min(0.95, 0.5 + margin / 8));
  const indicators = words
    .filter((w) => (MODEL.tf[best.label][w] || 0) > 0)
    .slice(0, 6);
  const valid = DELAY_REASONS.some((r) => r.id === best.label) ? best.label : "other";
  const band = confidence >= 0.75 ? "high" : confidence >= 0.55 ? "medium" : "low";
  return {
    category: valid,
    label: delayLabel(valid),
    confidence: Math.round(confidence * 100) / 100,
    confidence_band: band,
    explanation: `Prototype Naive Bayes (synthetic training phrases, version ${NLP_VERSION}) suggested ${delayLabel(valid)} because tokens such as ${
      indicators.length ? indicators.join(", ") : "the overall wording"
    } matched that class. This is not official MoSPI labelled data. An officer must confirm the category.`,
    indicators,
    version: NLP_VERSION,
    training: "synthetic_prototype",
  };
}

export function classifyFromIssue(issue) {
  const text = [issue?.title, issue?.intervention, issue?.owner].filter(Boolean).join(" ");
  return classifyBottleneck(text);
}
