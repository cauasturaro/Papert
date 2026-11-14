import assert from "node:assert/strict";
import test from "node:test";
import { orderByLastActivity } from "./roadmap-order.ts";

function item(id, workspace) {
  return { roadmap: { id }, workspace };
}

test("started roadmaps come first, most recent activity first", () => {
  const items = [
    item("new", null),
    item("old", {
      id: "w1",
      currentStep: 0,
      lastActivityAt: "2026-11-01T10:00:00Z",
    }),
    item("recent", {
      id: "w2",
      currentStep: 2,
      lastActivityAt: "2026-11-08T10:00:00Z",
    }),
    item("unknown", { id: "w3", currentStep: 1 }),
  ];

  const ordered = orderByLastActivity(items).map((entry) => entry.roadmap.id);

  assert.deepEqual(ordered, ["recent", "old", "unknown", "new"]);
});

test("without activity times the server order is kept", () => {
  const items = [
    item("a", { id: "w1", currentStep: 0 }),
    item("b", { id: "w2", currentStep: 0 }),
  ];

  const ordered = orderByLastActivity(items).map((entry) => entry.roadmap.id);

  assert.deepEqual(ordered, ["a", "b"]);
});
