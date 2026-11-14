import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  describeFailure,
  parseRetryAfter,
  RequestError,
} from "./request-error.ts";
import {
  errorKind,
  isRetryable,
  retryAfterMs,
  toLearnerMessage,
} from "./learner-error.ts";

function failure(status, message, headers = {}) {
  const response = { status, headers: new Headers(headers) };
  const details = describeFailure(
    response,
    message === undefined ? null : { message },
    0,
  );

  return new RequestError(status, message ?? "Unavailable.", details);
}

test("learner copy never repeats raw browser or JSON text", () => {
  const offline = new TypeError("Failed to fetch");
  const gateway = failure(502, '{"error":"upstream"}');
  const stack = failure(500, "TypeError: Cannot read properties of undefined");

  assert.match(toLearnerMessage(offline), /offline/);
  assert.match(toLearnerMessage(gateway), /trouble/);
  assert.match(toLearnerMessage(stack), /trouble/);
  assert.equal(
    toLearnerMessage(new Error("boom")),
    "Something went wrong. Try again.",
  );
});

test("readable server messages are kept for validation, conflict and not found", () => {
  const tooLong = failure(400, "The goal must be at most 500 characters.");
  const technical = failure(400, "prisma.workspace.update() failed");
  const missing = failure(404);

  assert.equal(
    toLearnerMessage(tooLong),
    "The goal must be at most 500 characters.",
  );
  assert.match(toLearnerMessage(technical), /not valid/);
  assert.match(toLearnerMessage(missing), /could not find/);
  assert.match(toLearnerMessage(failure(401, "jwe expired")), /session ended/);
});

test("rate limits and quota explain when to try again", () => {
  const limited = failure(
    429,
    "Execution rate limit reached. Retry in one minute.",
  );
  const withHeader = failure(429, "Slow down.", { "Retry-After": "42" });
  const quota = failure(
    429,
    "Not enough daily token quota for this request (0 left, 8000 needed). It resets on 1970-01-02 at 00:00 UTC.",
  );

  assert.equal(retryAfterMs(limited), 60_000);
  assert.match(toLearnerMessage(withHeader), /42 seconds/);
  assert.equal(errorKind(quota), "quota_exhausted");
  assert.equal(retryAfterMs(quota, 0), 86_400_000);
  assert.match(toLearnerMessage(quota, 0), /allowance.*resets/);
});

test("only network, server and rate-limit failures are retryable", () => {
  assert.equal(isRetryable(new TypeError("Load failed")), true);
  assert.equal(isRetryable(failure(503)), true);
  assert.equal(isRetryable(failure(429, "Slow down.")), true);

  assert.equal(isRetryable(failure(429, "Daily quota used.")), false);
  assert.equal(isRetryable(failure(409, "Revision is stale.")), false);
  assert.equal(isRetryable(failure(401)), false);
  assert.equal(isRetryable({ status: 400 }), false);
});

test("Retry-After accepts seconds and HTTP dates", () => {
  const now = Date.parse("2026-11-06T20:00:00Z");

  assert.equal(parseRetryAfter("5", now), 5000);
  assert.equal(parseRetryAfter("Fri, 06 Nov 2026 20:01:00 GMT", now), 60_000);
  assert.equal(parseRetryAfter("soon", now), null);
  assert.equal(parseRetryAfter(null, now), null);
});
