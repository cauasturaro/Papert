import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RequestError } from "../../../lib/api/request-error.ts";
import { classifySaveFailure } from "./save-failure.ts";

const NOW = 1_000_000;
const online = { attempts: 0, online: true, now: NOW };

test("a 409 from another tab's save becomes a conflict, not a retry", () => {
  const stale = new RequestError(409, "The workspace changed.", {
    kind: "conflict",
  });

  const outcome = classifySaveFailure(stale, online);

  assert.deepEqual(outcome, { type: "conflict" });
});

test("a 503 retries after the server's Retry-After", () => {
  const busy = new RequestError(503, "Busy.", {
    kind: "server",
    retryAfterMs: 8000,
  });

  const outcome = classifySaveFailure(busy, online);

  assert.equal(outcome.retried, true);
  assert.equal(outcome.failure.kind, "retrying");
  assert.equal(outcome.failure.retryAt, NOW + 8000);
});

test("retries back off with each attempt when the server gives no wait", () => {
  const down = new RequestError(502, "Down.", { kind: "server" });

  const first = classifySaveFailure(down, online);
  const third = classifySaveFailure(down, { ...online, attempts: 2 });

  assert.equal(first.failure.retryAt, NOW + 2000);
  assert.equal(third.failure.retryAt, NOW + 8000);
});

test("offline saves wait for reconnection without an error", () => {
  const offline = new RequestError(0, "Offline.", { kind: "network" });

  const outcome = classifySaveFailure(offline, { ...online, online: false });

  assert.deepEqual(outcome, { type: "failure", failure: null, retried: false });
});

test("invalid files and expired sessions stop autosave", () => {
  const invalid = new RequestError(400, "File too large.", {
    kind: "validation",
  });
  const expired = new RequestError(401, "Sign in.", {
    kind: "session_expired",
  });

  const rejected = classifySaveFailure(invalid, online);
  const signedOut = classifySaveFailure(expired, online);

  assert.equal(rejected.failure.kind, "invalid");
  assert.equal(signedOut.failure.kind, "failed");
  assert.equal(signedOut.retried, false);
});
