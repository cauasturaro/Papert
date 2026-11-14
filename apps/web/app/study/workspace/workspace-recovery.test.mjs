import assert from "node:assert/strict";
import { test } from "node:test";
import {
  draftFileName,
  parseRecovery,
  restoreDraft,
} from "./workspace-recovery.ts";

const saved = { files: { "a.ts": "saved" }, notes: "", revision: 2 };

test("keeps the saved workspace when the device has no recovery", () => {
  const restored = restoreDraft(saved, null);

  assert.deepEqual(restored, {
    draft: { files: saved.files, notes: "" },
    differs: false,
    conflict: false,
    recoveredAt: null,
  });
});

test("restores an unsaved draft and flags one based on another revision", () => {
  const sameRevision = {
    files: { "a.ts": "typed" },
    notes: "",
    revision: 2,
    savedAt: 1000,
  };
  const olderRevision = { ...sameRevision, revision: 1 };

  const resumed = restoreDraft(saved, sameRevision);
  const conflicting = restoreDraft(saved, olderRevision);

  assert.equal(resumed.differs, true);
  assert.equal(resumed.conflict, false);
  assert.equal(resumed.recoveredAt, 1000);
  assert.equal(resumed.draft.files["a.ts"], "typed");
  assert.equal(conflicting.conflict, true);
});

test("ignores a recovery record that matches the saved workspace", () => {
  const matching = { ...saved, savedAt: 1000 };

  const restored = restoreDraft(saved, matching);

  assert.equal(restored.differs, false);
  assert.equal(restored.recoveredAt, null);
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
  assert.throws(() => parseRecovery("null"));
});

test("accepts records written before the timestamp existed", () => {
  const legacy = JSON.stringify({ files: {}, notes: "", revision: 0 });

  const parsed = parseRecovery(legacy);

  assert.equal(typeof parsed.savedAt, "number");
});

test("names downloads after the roadmap", () => {
  assert.equal(draftFileName("Intro to React!"), "intro-to-react-files.json");
  assert.equal(draftFileName(""), "papert-workspace-files.json");
  assert.equal(draftFileName(undefined), "papert-workspace-files.json");
});
