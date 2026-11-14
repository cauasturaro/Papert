import { strict as assert } from "node:assert";
import { test } from "node:test";
import { shouldAnnounce } from "./announcer.ts";

test("repeated phrases are spoken once per short window", () => {
  assert.equal(shouldAnnounce("Saved", "", 0, 1000), true);
  assert.equal(shouldAnnounce("Saved", "Saved", 1000, 1500), false);
  assert.equal(shouldAnnounce("Saved", "Saved", 1000, 4000), true);
  assert.equal(shouldAnnounce("Offline", "Saved", 1000, 1100), true);
  assert.equal(shouldAnnounce("", "Saved", 0, 9000), false);
});
