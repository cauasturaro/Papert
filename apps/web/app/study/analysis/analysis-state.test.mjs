import test from "node:test";
import assert from "node:assert/strict";
import {
  analysesLeft,
  analysisPhase,
  askAboutFinding,
  criteriaStates,
  latestSettledAttempt,
  mentionedFiles,
  needsWorkCount,
  orderFindings,
} from "./analysis-state.ts";

function attempt(id, stepId, status, createdAt, criteria) {
  return {
    id,
    stepId,
    createdAt,
    result: criteria ? { status, evaluation: { criteria } } : { status },
  };
}

test("finds the newest settled attempt, optionally on one step", () => {
  const attempts = [
    attempt("old", "one", "needs_work", "2026-11-01T10:00:00Z"),
    attempt("pending", "one", "evaluating", "2026-11-03T10:00:00Z"),
    attempt("recorded", "two", "not_evaluated", "2026-11-04T10:00:00Z"),
    attempt("new", "two", "approved", "2026-11-02T10:00:00Z"),
  ];

  assert.equal(latestSettledAttempt(attempts)?.id, "new");
  assert.equal(latestSettledAttempt(attempts, "one")?.id, "old");
  assert.equal(latestSettledAttempt([]), null);
});

test("criteria read met, not met or unchecked from the latest analysis of the step", () => {
  const attempts = [
    attempt("a", "one", "needs_work", "2026-11-01T10:00:00Z", [
      { id: "x", status: "not_met" },
    ]),
    attempt("b", "one", "needs_work", "2026-11-02T10:00:00Z", [
      { id: "x", status: "met" },
      { id: "y", status: "not_met" },
    ]),
  ];

  const states = criteriaStates(
    [{ id: "x" }, { id: "y" }, { id: "z" }],
    attempts,
    "one",
  );

  assert.deepEqual(
    [...states.entries()],
    [
      ["x", "met"],
      ["y", "not_met"],
      ["z", "unchecked"],
    ],
  );

  const otherStep = criteriaStates([{ id: "x" }], attempts, "two");

  assert.equal(otherStep.get("x"), "unchecked");
});

test("orders findings by severity and keeps ties stable", () => {
  const findings = [
    { severity: "info", message: "1" },
    { severity: "error", message: "2" },
    { severity: "warning", message: "3" },
    { severity: "error", message: "4" },
  ];

  const ordered = orderFindings(findings).map((finding) => finding.message);

  assert.deepEqual(ordered, ["2", "4", "3", "1"]);
});

test("counts needs-work analyses per step", () => {
  const attempts = [
    attempt("a", "one", "needs_work", "2026-11-01T10:00:00Z"),
    attempt("b", "one", "needs_work", "2026-11-02T10:00:00Z"),
    attempt("c", "two", "needs_work", "2026-11-02T10:00:00Z"),
    attempt("d", "one", "analysis_failed", "2026-11-02T10:00:00Z"),
  ];

  assert.equal(needsWorkCount(attempts, "one"), 2);
});

test("maps progress to stepper phases", () => {
  assert.equal(analysisPhase({ status: "queued", sequence: 0 }), "queued");
  assert.equal(analysisPhase({ status: "running", sequence: 1 }), "checking");
  assert.equal(analysisPhase({ status: "running", sequence: 2 }), "writing");

});

test("estimates analyses left from free quota", () => {
  const quota = {
    limit: 100000,
    used: 60000,
    reserved: 8000,
    reservation: 8000,
  };

  assert.equal(analysesLeft(quota), 4);
  assert.equal(analysesLeft({ ...quota, used: 100000 }), 0);
});

test("asks about a finding with its location and asks for a hint", () => {
  const finding = {
    category: "logic",
    severity: "error",
    path: "src/app.ts",
    line: 12,
    message: "The status code is wrong.",
  };

  const prompt = askAboutFinding(finding);

  assert.match(prompt, /src\/app\.ts \(line 12\)/);
  assert.match(prompt, /hint, not the answer/);
});

test("finds files mentioned in instructions", () => {
  const instructions =
    "Create `src/validate.ts` and update src/server.ts, then explain in README.md. Version 1.2 is fine.";

  const files = mentionedFiles(instructions, { "src/server.ts": "" });

  assert.deepEqual(files, ["src/validate.ts", "src/server.ts", "README.md"]);
});
