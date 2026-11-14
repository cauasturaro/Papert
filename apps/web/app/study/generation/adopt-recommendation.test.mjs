import assert from "node:assert/strict";
import test from "node:test";
import { adoptRecommendation } from "./adopt-recommendation.ts";

test("secures the workspace before discarding and navigating", async () => {
  const calls = [];
  const destination = { workspaceId: "destination" };

  await adoptRecommendation(
    async () => {
      calls.push("create");
      return destination;
    },
    async () => {
      calls.push("discard");
    },
    (workspace) => {
      assert.equal(workspace, destination);
      calls.push("open");
    },
  );

  assert.deepEqual(calls, ["create", "discard", "open"]);
});

test("a failed start preserves the draft and its sources", async () => {
  const calls = [];
  const failure = new Error("Could not start");

  const adoption = adoptRecommendation(
    async () => {
      throw failure;
    },
    async () => {
      calls.push("discard");
    },
    () => calls.push("open"),
  );

  await assert.rejects(adoption, failure);
  assert.deepEqual(calls, []);
});

test("a failed discard keeps the learner on the draft", async () => {
  let opened = false;
  const failure = new Error("Could not discard");

  const adoption = adoptRecommendation(
    async () => ({ workspaceId: "destination" }),
    async () => {
      throw failure;
    },
    () => {
      opened = true;
    },
  );

  await assert.rejects(adoption, failure);
  assert.equal(opened, false);
});
