import test from "node:test";
import assert from "node:assert/strict";
import { newerSnapshot, isRunning } from "../app/study/execution-state.ts";

test("reconnect replaces a cumulative snapshot once and ignores duplicates, stale frames and other jobs", () => {
  const first = {
    id: "a",
    workspaceId: "w",
    status: "running",
    text: "Hello",
    sequence: 2,
    charged: 1000,
    reserved: 2000,
  };
  const final = {
    ...first,
    sequence: 3,
    status: "completed",
    text: "Hello again",
  };

  assert.equal(newerSnapshot(first, first), first);
  assert.equal(newerSnapshot(final, first), final);
  assert.equal(newerSnapshot(first, { ...final, id: "another" }), first);
  assert.equal(newerSnapshot(first, final), final);
  assert.equal(isRunning(first), true);
  assert.equal(isRunning(final), false);
});
