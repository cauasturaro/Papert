import { strict as assert } from "node:assert";
import { test } from "node:test";
import { queryRetryDelay, shouldRetryQuery } from "./query-client.ts";
import { RequestError } from "./request-error.ts";

test("queries retry network and server failures, never 4xx answers", () => {
  const network = new RequestError(0, "Offline.", { kind: "network" });
  const server = new RequestError(503, "Unavailable.", { kind: "server" });
  const notFound = new RequestError(404, "Missing.", { kind: "not_found" });
  const unauthorized = new RequestError(401, "Sign in.", {
    kind: "session_expired",
  });

  assert.equal(shouldRetryQuery(0, network), true);
  assert.equal(shouldRetryQuery(1, server), true);
  assert.equal(shouldRetryQuery(2, server), false);
  assert.equal(shouldRetryQuery(0, notFound), false);
  assert.equal(shouldRetryQuery(0, unauthorized), false);
});

test("retry delay follows Retry-After when the server sends one", () => {
  const limited = new RequestError(429, "Slow down.", {
    kind: "rate_limited",
    retryAfterMs: 4000,
  });
  const server = new RequestError(503, "Unavailable.", { kind: "server" });

  assert.equal(queryRetryDelay(0, limited), 4000);
  assert.equal(queryRetryDelay(1, server), 2000);
  assert.equal(queryRetryDelay(10, server), 30_000);
});
