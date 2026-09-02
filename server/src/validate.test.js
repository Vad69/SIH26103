import test from "node:test";
import assert from "node:assert/strict";
import { validateProjectNumbers } from "./validate.js";

test("rejects negative costs and overspend", () => {
  assert.match(validateProjectNumbers({ original_cost: -1, revised_cost: 10, expenditure: 1 }), /negative/);
  assert.match(
    validateProjectNumbers({ original_cost: 100, revised_cost: 120, expenditure: 130 }),
    /exceed/
  );
});

test("requires an explanation when revised cost falls", () => {
  assert.match(
    validateProjectNumbers({ original_cost: 100, revised_cost: 80, expenditure: 10, delay_notes: "" }),
    /explanation/
  );
  assert.equal(
    validateProjectNumbers({ original_cost: 100, revised_cost: 80, expenditure: 10, delay_notes: "Scope cut" }),
    null
  );
});

test("rejects revised completion before original", () => {
  assert.match(
    validateProjectNumbers({
      original_cost: 1,
      revised_cost: 1,
      expenditure: 0,
      original_end_date: "2027-12-31",
      revised_end_date: "2027-06-01",
    }),
    /earlier/
  );
});
