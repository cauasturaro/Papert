import assert from "node:assert/strict";
import { test } from "node:test";
import { automaticSaveAllowed, sameDraft, savedWorkspace } from "./workspace-session-state.ts";

test("all automatic save paths wait for recovery confirmation", () => {
  const state = { conflict: false, recoveredAt: 100 };

  assert.equal(automaticSaveAllowed(state, true, false), false);

  state.recoveredAt = null;

  assert.equal(automaticSaveAllowed(state, true, false), true);
  assert.equal(automaticSaveAllowed(state, false, false), false);
  assert.equal(automaticSaveAllowed(state, true, true), false);

  state.conflict = true;

  assert.equal(automaticSaveAllowed(state, true, false), false);
});

test("accepting a saved revision preserves refreshed attempts and sends only the saved draft", () => {
  const workspace = {
    id: "workspace",
    revision: 1,
    files: { "main.ts": "original" },
    notes: "",
    attempts: [{ id: "recent" }],
  };
  const sent = { files: { "main.ts": "sent" }, notes: "notes" };

  const result = savedWorkspace(workspace, sent, { id: "workspace", revision: 2 });

  assert.equal(result.revision, 2);
  assert.deepEqual(result.attempts, workspace.attempts);
  assert.equal(sameDraft(sent, result), true);
  assert.equal(sameDraft({ ...sent, notes: "newer typing" }, result), false);
  assert.equal(workspace.files["main.ts"], "original");
});
