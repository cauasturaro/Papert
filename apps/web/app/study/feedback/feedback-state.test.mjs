import assert from "node:assert/strict";
import test from "node:test";
import {
  changes,
  confirmation,
  feedbackIds,
  nextFeedback,
} from "./feedback-state.ts";

const stored = {
  executionId: "e1",
  rating: "down",
  hallucination: false,
  delivered: true,
  updatedAt: "2026-11-05T10:00:00Z",
};

test("a hallucination report rates the answer down", () => {
  assert.deepEqual(nextFeedback("report"), {
    rating: "down",
    hallucination: true,
  });
  assert.deepEqual(nextFeedback("unreport"), {
    rating: "down",
    hallucination: false,
  });
  assert.deepEqual(nextFeedback("up"), { rating: "up", hallucination: false });
});

test("repeating the stored verdict is not a change", () => {
  assert.equal(changes(stored, nextFeedback("down")), false);
  assert.equal(changes(stored, nextFeedback("up")), true);
  assert.equal(changes(stored, nextFeedback("report")), true);
  assert.equal(changes(undefined, nextFeedback("down")), true);
});

test("the confirmation says whether the verdict reached quality review", () => {
  assert.equal(confirmation(undefined), "");
  assert.match(confirmation({ ...stored, delivered: false }), /shortly/);
  assert.match(confirmation({ ...stored, hallucination: true }), /Reported/);
  assert.match(confirmation(stored), /sent/);
});

test("feedback ids are unique and ordered", () => {
  assert.deepEqual(feedbackIds(["b", "a", "b"]), ["a", "b"]);
});
