import assert from "node:assert/strict";
import test from "node:test";
import {
  pendingSources,
  sourceUses,
} from "../app/study/generation/source-use.ts";

const notes = { id: "s1", filename: "notes.md", status: "ready" };
const pdf = { id: "s2", filename: "guide.pdf", status: "processing" };
const broken = { id: "s3", filename: "scan.pdf", status: "failed" };
const unrelated = { id: "s4", filename: "bread.md", status: "ready" };

test("before generation, sources are labelled by readiness only", () => {
  const uses = sourceUses([notes, pdf, broken], {
    status: "open",
    consulted: [],
    evidence: [],
    stepIds: [],
  });

  assert.deepEqual(
    uses.map((use) => [use.filename, use.tone]),
    [
      ["notes.md", "neutral"],
      ["guide.pdf", "warning"],
      ["scan.pdf", "warning"],
    ],
  );
  assert.match(uses[2].label, /will not be used/);
  assert.equal(pendingSources([notes, pdf, broken]), 1);
});

test("after generation, only cited sources are reported as used", () => {
  const evidence = [
    { stepId: "ports", sourceId: "s1", cite: "notes.md, lines 1-4" },
    { stepId: "adapters", sourceId: "s1", cite: "notes.md, lines 8-9" },
    { stepId: "ports", sourceId: "s1", cite: "notes.md, lines 5-6" },
  ];

  const uses = sourceUses([notes, unrelated, broken], {
    status: "generated",
    consulted: [
      { id: "s1", filename: "notes.md" },
      { id: "s4", filename: "bread.md" },
    ],
    evidence,
    stepIds: ["domain", "ports", "adapters"],
  });

  assert.equal(uses[0].label, "Used in steps 2, 3");
  assert.equal(uses[0].tone, "used");

  assert.match(uses[1].label, /nothing in it was cited/);
  assert.match(uses[2].label, /not ready when the roadmap was generated/);
});
