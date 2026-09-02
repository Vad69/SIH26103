export const DELAY_REASONS = [
  { id: "land_acquisition", label: "Land acquisition" },
  { id: "environmental_clearance", label: "Environmental clearance" },
  { id: "funding", label: "Funding issue" },
  { id: "procurement", label: "Tender / procurement delay" },
  { id: "contractor", label: "Contractor issue" },
  { id: "utility_shifting", label: "Utility shifting" },
  { id: "coordination", label: "Inter-ministerial coordination" },
  { id: "legal", label: "Legal issue" },
  { id: "disaster", label: "Natural disaster" },
  { id: "other", label: "Other" },
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
