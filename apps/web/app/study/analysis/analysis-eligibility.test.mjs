import assert from "node:assert/strict";
import { test } from "node:test";
import { alreadyAnalyzed, approvalOf } from "./analysis-eligibility.ts";

function workspace(status = "needs_work") {
  return {
    currentStep: 0,
    files: { "main.ts": "code" },
    roadmap: { definition: { steps: [{ id: "one" }, { id: "two" }] } },
    attempts: [{
      id: "attempt",
      stepId: "one",
      files: { "main.ts": "code" },
      result: { status },
      createdAt: "2026-11-01T00:00:00Z",
    }],
  };
}

test("reuses only settled verdicts for the same code on the current step", () => {
  const saved = workspace();

  assert.equal(alreadyAnalyzed(saved), true);
  assert.equal(alreadyAnalyzed(workspace("approved")), true);
  assert.equal(alreadyAnalyzed(workspace("analysis_failed")), false);
  assert.equal(alreadyAnalyzed(undefined), false);

  saved.files = { "main.ts": "changed" };

  assert.equal(alreadyAnalyzed(saved), false);

  saved.files = { "main.ts": "code" };
  saved.currentStep = 1;

  assert.equal(alreadyAnalyzed(saved), false);
});

test("identifies the unlocked step and completion only for known approvals", () => {
  const saved = workspace("approved");

  assert.deepEqual(approvalOf(saved, "attempt"), {
    attemptId: "attempt", approvedStep: 0, nextStep: 1,
  });
  assert.equal(approvalOf(saved, "missing"), null);
  assert.equal(approvalOf(workspace(), "attempt"), null);
  assert.equal(approvalOf(undefined, "attempt"), null);

  saved.attempts[0].stepId = "two";

  assert.deepEqual(approvalOf(saved, "attempt"), {
    attemptId: "attempt", approvedStep: 1, nextStep: null,
  });

});
