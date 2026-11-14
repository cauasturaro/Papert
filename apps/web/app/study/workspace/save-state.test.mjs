import { compactSaveLabel } from "./save-state.ts";
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveSaveState,
  retryDelay,
  saveAnnouncement,
  saveLabel,
} from "./save-state.ts";

const idle = {
  dirty: false,
  saving: false,
  online: true,
  conflict: false,
  sessionExpired: false,
  failure: null,
};

test("the most urgent condition decides the save state", () => {
  const retrying = { kind: "retrying", message: "", retryAt: 0 };

  assert.equal(deriveSaveState(idle), "saved");
  assert.equal(deriveSaveState({ ...idle, dirty: true }), "unsaved");
  assert.equal(
    deriveSaveState({ ...idle, dirty: true, saving: true }),
    "saving",
  );
  assert.equal(
    deriveSaveState({ ...idle, dirty: true, online: false }),
    "offline",
  );
  assert.equal(
    deriveSaveState({ ...idle, dirty: true, failure: retrying }),
    "retrying",
  );
  assert.equal(
    deriveSaveState({ ...idle, dirty: true, sessionExpired: true }),
    "signed_out",
  );
  assert.equal(
    deriveSaveState({ ...idle, dirty: true, conflict: true, online: false }),
    "conflict",
  );
});

test("labels use plain words and a countdown", () => {
  const now = 10_000;

  assert.equal(saveLabel("saved", { savedAt: null, now }), "Saved");
  assert.equal(saveLabel("saved", { savedAt: now, now }), "Saved · just now");
  assert.equal(
    saveLabel("retrying", { savedAt: null, retryAt: now + 7_200, now }),
    "Couldn't save — retrying in 8 s",
  );
});

test("routine autosaves are not announced", () => {
  assert.equal(saveAnnouncement("unsaved", "saving"), null);
  assert.equal(saveAnnouncement("saving", "saved"), null);
  assert.equal(saveAnnouncement("retrying", "saved"), "All changes saved.");
  assert.equal(saveAnnouncement("offline", "unsaved"), "Back online.");
  assert.notEqual(saveAnnouncement("unsaved", "offline"), null);
});

test("retries back off exponentially and honour the server's wait", () => {
  assert.equal(retryDelay(0, null), 2000);
  assert.equal(retryDelay(2, null), 8000);
  assert.equal(retryDelay(20, null), 60_000);
  assert.equal(retryDelay(0, 15_000), 15_000);
});

test("phone save labels identify every state without relying on color", () => {
  const states = [
    "saved",
    "unsaved",
    "saving",
    "offline",
    "retrying",
    "failed",
    "invalid",
    "conflict",
    "signed_out",
  ];
  const labels = states.map(compactSaveLabel);

  assert.deepEqual(labels, [
    "Saved",
    "Unsaved",
    "Saving…",
    "Offline",
    "Retrying…",
    "Not saved",
    "Check files",
    "Conflict",
    "Signed out",
  ]);
  assert.equal(new Set(labels).size, states.length);
});
