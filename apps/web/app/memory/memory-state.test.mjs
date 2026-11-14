import assert from "node:assert/strict";
import test from "node:test";
import { groupMemory, memoryTextProblem, proposalFor } from "./memory-state.ts";

const base = {
  origin: "learner",
  executionId: null,
  expiresAt: null,
  createdAt: "2026-11-05T10:00:00Z",
  updatedAt: "2026-11-05T10:00:00Z",
};

const items = [
  {
    ...base,
    id: "p",
    kind: "preference",
    text: "Python",
    status: "proposed",
    origin: "seymour",
    executionId: "e1",
  },
  {
    ...base,
    id: "a",
    kind: "preference",
    text: "Short answers",
    status: "active",
  },
  { ...base, id: "d", kind: "difficulty", text: "Closures", status: "active" },
];

test("groups proposals and active items by kind", () => {
  const groups = groupMemory(items);

  assert.deepEqual(
    groups.proposals.map((item) => item.id),
    ["p"],
  );
  assert.deepEqual(
    groups.preferences.map((item) => item.id),
    ["a"],
  );
  assert.deepEqual(
    groups.difficulties.map((item) => item.id),
    ["d"],
  );
  assert.equal(groups.activeCount, 2);
});

test("finds the unreviewed proposal of an answer", () => {
  assert.equal(proposalFor(items, "e1")?.id, "p");
  assert.equal(proposalFor(items, "e2"), undefined);
  assert.equal(proposalFor(undefined, "e1"), undefined);
});

test("explains text length problems with collapsed whitespace", () => {
  assert.match(memoryTextProblem("  a    "), /at least 3/);
  assert.equal(memoryTextProblem("Use analogies"), null);
  assert.match(memoryTextProblem("x".repeat(201)), /under 200/);
});
