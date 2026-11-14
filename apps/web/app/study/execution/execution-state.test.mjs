import test from "node:test";
import assert from "node:assert/strict";
import {
  failureMessage,
  isRunning,
  newerSnapshot,
  progressLabel,
  questionsLeft,
  quotaBlocked,
  turnState,
} from "./execution-state.ts";

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

test("turns read as learner states and labels, never raw statuses", () => {
  const base = {
    id: "a",
    workspaceId: "w",
    sequence: 1,
    charged: 0,
    reserved: 0,
  };
  const searching = {
    ...base,
    status: "running",
    text: "Seymour is searching your sources…",
  };
  const reading = {
    ...base,
    status: "running",
    text: "Seymour is checking the saved context…",
  };
  const queued = { ...base, status: "queued", text: "" };
  const limit = {
    ...base,
    status: "failed",
    text: "Seymour ran out of time on this question.",
  };
  const technical = {
    ...base,
    status: "failed",
    text: "Context exceeds this attempt's token budget.",
  };

  assert.equal(turnState(searching), "working");
  assert.equal(
    turnState({ ...base, status: "completed", text: "Hi" }),
    "answered",
  );
  assert.equal(
    turnState({ ...base, status: "cancelled", text: "" }),
    "stopped",
  );
  assert.equal(turnState({ ...base, status: "timed_out", text: "" }), "failed");

  assert.equal(progressLabel(searching), "Looking at your sources…");
  assert.equal(progressLabel(reading), "Looking at your code…");
  assert.equal(progressLabel(queued), "Thinking…");

  assert.equal(failureMessage(limit), limit.text);
  assert.equal(
    failureMessage(technical),
    "Seymour couldn't answer this time. Try again.",
  );
  assert.equal(
    failureMessage({ ...base, status: "cancelled", text: "Seymour is…" }),
    "You stopped this answer.",
  );
});

test("quota is estimated in whole questions and blocks before the allowance runs out", () => {
  const quota = {
    limit: 100000,
    used: 60000,
    reserved: 8000,
    reservation: 8000,
  };

  assert.equal(questionsLeft(quota), 4);
  assert.equal(quotaBlocked(quota), false);
  assert.equal(questionsLeft({ ...quota, used: 90000 }), 0);
  assert.equal(quotaBlocked({ ...quota, used: 90000 }), true);
});
