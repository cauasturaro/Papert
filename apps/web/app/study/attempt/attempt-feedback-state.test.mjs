import assert from "node:assert/strict";
import { test } from "node:test";
import { summaryDisagrees } from "./attempt-feedback-state.ts";

test("does not mistake negated approval for a positive verdict", () => {
  const result = { status: "needs_work" };

  for (const summary of ["Not approved yet.", "Never approved.", "Not all criteria are met.", "This isn't approved."]) {
    assert.equal(summaryDisagrees(result, summary), false, summary);
  }

  assert.equal(summaryDisagrees(result, "All criteria are met."), true);
  assert.equal(summaryDisagrees(result, "Not approved before, but now approved."), true);
});

test("flags failure wording only when the recorded verdict is approved", () => {
  assert.equal(summaryDisagrees({ status: "approved" }, "A criterion is not yet met."), true);
  assert.equal(summaryDisagrees({ status: "approved" }, "All criteria are met."), false);
  assert.equal(summaryDisagrees({ status: "analysis_failed" }, "Approved."), false);
});
