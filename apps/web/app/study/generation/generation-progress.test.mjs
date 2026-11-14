import assert from "node:assert/strict";
import test from "node:test";
import { formatElapsed, generationPhase } from "./generation-progress.ts";

test("progress text maps to the phase Seymour is in", () => {
  assert.equal(generationPhase(""), 0);
  assert.equal(generationPhase("Seymour is reading your sources…"), 0);
  assert.equal(generationPhase("Seymour is drafting your roadmap…"), 1);
  assert.equal(generationPhase("Seymour is correcting the roadmap…"), 2);
});

test("elapsed time reads as minutes and seconds", () => {
  assert.equal(formatElapsed(0), "0:00");
  assert.equal(formatElapsed(42_400), "0:42");
  assert.equal(formatElapsed(65_000), "1:05");
});
