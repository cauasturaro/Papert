import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  recommendationView,
  shouldCheck,
  similarityLabel,
} from "./recommendation-state.ts";

const base = {
  executionId: "e",
  status: "ready",
  matches: [],
  declined: false,
};
const match = { roadmapId: "hexagonal", similarity: 0.6 };

test("maps the stored check to what the page shows", () => {
  assert.equal(recommendationView(null), "idle");
  assert.equal(
    recommendationView({ ...base, status: "searching" }),
    "searching",
  );
  assert.equal(recommendationView({ ...base, matches: [match] }), "matches");
  assert.equal(recommendationView(base), "none");
  assert.equal(recommendationView({ ...base, status: "failed" }), "failed");
  assert.equal(
    recommendationView({ ...base, matches: [match], declined: true }),
    "declined",
  );
});

test("checks once for drafts that can still generate", () => {
  assert.equal(shouldCheck("open", null), true);
  assert.equal(shouldCheck("failed", null), true);
  assert.equal(shouldCheck("generated", null), false);
  assert.equal(shouldCheck("open", base), false);
});

test("similarity reads as words", () => {
  assert.equal(similarityLabel(0.72), "Very similar to your goal");
  assert.equal(similarityLabel(0.55), "Similar to your goal");
  assert.equal(similarityLabel(0.36), "Related to your goal");
});
