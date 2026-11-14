import assert from "node:assert/strict";
import test from "node:test";
import { isPdfCancellation } from "./pdf-errors.ts";

test("only PDF cancellation errors are suppressed", () => {
  const cancelled = new Error("Rendering stopped");
  cancelled.name = "RenderingCancelledException";
  const aborted = new Error("Text stream stopped");
  aborted.name = "AbortException";
  const broken = new Error("Canvas unavailable");

  const results = [cancelled, aborted, broken, null].map(isPdfCancellation);

  assert.deepEqual(results, [true, true, false, false]);
});
