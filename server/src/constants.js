export const DELAY_REASONS = [
  { id: "land_acquisition", label: "Land acquisition" },
  { id: "environmental_clearance", label: "Environmental clearance" },
  { id: "funding", label: "Fund / payment shortage" },
  { id: "procurement", label: "Tender / procurement delay" },
  { id: "contractor", label: "Contractor / agency issue" },
  { id: "utility_shifting", label: "Utility / infrastructure" },
  { id: "coordination", label: "Inter-ministerial coordination" },
  { id: "legal", label: "Legal / regulatory" },
  { id: "law_order", label: "Law and order" },
  { id: "equipment", label: "Equipment / material supply" },
  { id: "design", label: "Design / technical" },
  { id: "disaster", label: "Natural disaster" },
  { id: "other", label: "Other" },
];

export const PRECON_CATEGORIES = [
  { id: "land_acquisition", label: "Land Acquisition" },
  { id: "environmental_clearance", label: "Environmental Clearance" },
  { id: "forest_clearance", label: "Forest Clearance" },
  { id: "legal", label: "Legal Approval" },
  { id: "dpr_approval", label: "DPR Approval" },
  { id: "utility_shifting", label: "Utility Shifting" },
  { id: "procurement", label: "Tender / Contract Approval" },
  { id: "statutory", label: "Statutory Approval" },
  { id: "site_readiness", label: "Site Readiness" },
];

export const PRECON_STATUSES = [
  { id: "not_started", label: "Not Started" },
  { id: "in_progress", label: "In Progress" },
  { id: "completed", label: "Completed" },
  { id: "delayed", label: "Delayed" },
  { id: "blocked", label: "Blocked" },
];

export const MINISTRIES = [
  "Ministry of Road Transport and Highways",
  "Ministry of Railways",
  "Ministry of Power",
  "Ministry of Jal Shakti",
  "Ministry of Petroleum and Natural Gas",
  "Ministry of Statistics and Programme Implementation",
  "Ministry of Housing and Urban Affairs",
];

export const SECTORS = [
  "Roads & Highways",
  "Railways",
  "Power",
  "Irrigation",
  "Oil & Gas",
  "Urban Infrastructure",
  "Statistics & IT systems",
];

export const STATES = [
  "All India / Multi-state",
  "Maharashtra",
  "Uttar Pradesh",
  "Bihar",
  "West Bengal",
  "Odisha",
  "Tamil Nadu",
  "Karnataka",
  "Assam",
  "Delhi",
];

export function delayLabel(id) {
  return DELAY_REASONS.find((r) => r.id === id)?.label || id || "Unspecified";
}

export function preconLabel(id) {
  return PRECON_CATEGORIES.find((r) => r.id === id)?.label || id || "Unspecified";
}
