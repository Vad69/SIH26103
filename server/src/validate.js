export function validateProjectNumbers(fields, existing = {}) {
  const original = Number(fields.original_cost);
  const revised = Number(fields.revised_cost);
  const expenditure = Number(fields.expenditure);
  const released =
    fields.funds_released === undefined || fields.funds_released === ""
      ? Number(existing.funds_released ?? 0)
      : Number(fields.funds_released);
  const reported = fields.reported_physical_progress;
  const notes = String(fields.delay_notes || "").trim();

  if ([original, revised, expenditure].some((n) => Number.isNaN(n))) {
    return "Cost and expenditure must be numbers.";
  }
  if (fields.funds_released !== undefined && fields.funds_released !== "" && Number.isNaN(released)) {
    return "Funds released must be a number.";
  }
  if (original < 0 || revised < 0 || expenditure < 0 || released < 0) {
    return "Costs, funds released and expenditure cannot be negative.";
  }
  const ceiling = revised > 0 ? revised : original;
  if (ceiling > 0 && expenditure > ceiling) {
    return "Expenditure cannot exceed the latest revised cost (or original cost if no revision).";
  }
  if (ceiling > 0 && released > ceiling) {
    return "Funds released cannot exceed the latest revised cost (or original cost if no revision).";
  }
  if (revised > 0 && original > 0 && revised < original && !notes) {
    return "If revised cost is lower than original approved cost, record an explanation in delay notes.";
  }
  if (reported !== undefined && reported !== null && reported !== "") {
    const r = Number(reported);
    if (Number.isNaN(r) || r < 0 || r > 100) {
      return "Reported physical progress must be between 0 and 100.";
    }
  }
  const originalEnd = fields.original_end_date || existing.original_end_date;
  const revisedEnd = fields.revised_end_date || existing.revised_end_date;
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (originalEnd && !iso.test(String(originalEnd))) {
    return "Original completion must use YYYY-MM-DD.";
  }
  if (revisedEnd && !iso.test(String(revisedEnd))) {
    return "Revised completion must use YYYY-MM-DD.";
  }
  if (originalEnd && revisedEnd && revisedEnd < originalEnd) {
    return "Revised completion cannot be earlier than the original completion date.";
  }
  return null;
}
