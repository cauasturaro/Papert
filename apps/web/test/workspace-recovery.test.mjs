import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseRecovery,
  restoreDraft,
} from "../app/study/workspace-recovery.ts";

const saved = { files: { "a.ts": "saved" }, notes: "", revision: 2 };

test("keeps the saved workspace when the tab has no recovery", () => {
  const restored = restoreDraft(saved, null);

  assert.deepEqual(restored, {
    draft: { files: saved.files, notes: "" },
    differs: false,
    conflict: false,
  });
});

test("restores an unsaved draft and flags one based on another revision", () => {
  const sameRevision = { files: { "a.ts": "typed" }, notes: "", revision: 2 };
  const olderRevision = { ...sameRevision, revision: 1 };

  const resumed = restoreDraft(saved, sameRevision);
  const conflicting = restoreDraft(saved, olderRevision);

  assert.equal(resumed.differs, true);
  assert.equal(resumed.conflict, false);
  assert.equal(resumed.draft.files["a.ts"], "typed");
  assert.equal(conflicting.conflict, true);
});

test("rejects malformed recovery records", () => {
  const badFiles = JSON.stringify({
    files: { "a.ts": 1 },
    notes: "",
    revision: 0,
  });
  const badRevision = JSON.stringify({ files: {}, notes: "", revision: -1 });

  assert.throws(() => parseRecovery(badFiles));
  assert.throws(() => parseRecovery(badRevision));
  assert.throws(() => parseRecovery("not json"));
});
