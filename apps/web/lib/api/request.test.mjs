import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { createJsonRequest, RequestError } from "./request.ts";

import { errorKind, isRetryable } from "./learner-error.ts";
import { isSessionExpired, markSignedIn, markSignedOut } from "../auth/session-signal.ts";

const request = createJsonRequest({
  base: "/api/test",
  unauthorized: "Sign in.",
  unavailable: "Unavailable.",
});

const realFetch = globalThis.fetch;

function respondWith(response) {
  globalThis.fetch = async () => response.clone();
}

// Answers each URL from its own queue and records the order of calls.
function route(responses) {
  const calls = [];

  globalThis.fetch = async (url) => {
    calls.push(String(url));

    return responses[String(url)].shift();
  };

  return calls;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  markSignedOut();
});

test("resolves JSON bodies and empty 204 responses", async () => {
  respondWith(Response.json({ ok: true }));
  assert.deepEqual(await request("items"), { ok: true });

  respondWith(new Response(null, { status: 204 }));
  assert.equal(await request("items", "DELETE"), undefined);
});

test("uses Core's message, or the fallback when the body is not JSON", async () => {
  respondWith(Response.json({ message: "Too long." }, { status: 400 }));
  await assert.rejects(request("items"), { status: 400, message: "Too long." });

  respondWith(new Response("<html>Bad gateway</html>", { status: 502 }));
  await assert.rejects(request("items"), (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.status, 502);
    assert.equal(error.message, "Unavailable.");

    return true;
  });
});

test("renews an expired access token once and retries the request", async () => {
  const user = { user: { id: "u1", email: "learner@example.com" } };
  const calls = route({
    "/api/test/items": [
      Response.json({ message: "jwe expired" }, { status: 401 }),
      Response.json({ ok: true }),
    ],
    "/api/auth/refresh": [Response.json(user)],
  });

  const result = await request("items");

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(calls, [
    "/api/test/items",
    "/api/auth/refresh",
    "/api/test/items",
  ]);
});

test("reports the sign-in message when the session cannot be renewed", async () => {
  const calls = route({
    "/api/test/items": [Response.json({}, { status: 401 })],
    "/api/auth/refresh": [new Response(null, { status: 401 })],
  });

  await assert.rejects(request("items"), { status: 401, message: "Sign in." });
  assert.deepEqual(calls, ["/api/test/items", "/api/auth/refresh"]);
});

test("replaces any 401 body with the sign-in message", async () => {
  respondWith(Response.json({ message: "jwe expired" }, { status: 401 }));

  await assert.rejects(request("items"), { status: 401, message: "Sign in." });
});

test("wraps browser fetch failures in a network error", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };

  await assert.rejects(request("items"), (error) => {
    assert.ok(error instanceof RequestError);
    assert.equal(error.status, 0);
    assert.equal(error.kind, "network");
    assert.doesNotMatch(error.message, /Failed to fetch/);

    return true;
  });
});

test("keeps aborts as they are", async () => {
  const abort = new DOMException("The operation was aborted.", "AbortError");
  globalThis.fetch = async () => {
    throw abort;
  };

  await assert.rejects(request("items"), (error) => error === abort);
});

test("classifies statuses and reads Retry-After", async () => {
  const limited = Response.json(
    { message: "Execution rate limit reached. Retry in one minute." },
    { status: 429, headers: { "Retry-After": "30" } },
  );
  respondWith(limited);

  await assert.rejects(request("items"), (error) => {
    assert.equal(error.kind, "rate_limited");
    assert.equal(error.retryAfterMs, 30_000);

    return true;
  });

  respondWith(
    Response.json({ message: "Revision is stale." }, { status: 409 }),
  );
  await assert.rejects(request("items"), {
    kind: "conflict",
    serverMessage: "Revision is stale.",
  });

  respondWith(new Response(null, { status: 503 }));
  await assert.rejects(request("items"), {
    kind: "server",
    message: "Unavailable.",
  });
});

test("recognizes Core's daily quota message and its reset time", async () => {
  const quota = Response.json(
    {
      message:
        "Not enough daily token quota for this request (0 left, 8000 needed). It resets on 2026-11-07 at 00:00 UTC.",
    },
    { status: 429 },
  );
  respondWith(quota);

  await assert.rejects(request("items"), (error) => {
    assert.equal(error.kind, "quota_exhausted");
    assert.equal(error.resetsAt, Date.UTC(2026, 10, 7));
    assert.equal(error.serverMessage, null);

    return true;
  });
});

for (const status of [500, 503]) {
  test(`refresh failure ${status} keeps its server status`, async () => {
    const calls = route({
      "/api/test/items": [new Response(null, { status: 401 })],
      "/api/auth/refresh": [new Response(null, { status })],
    });

    markSignedIn();

    await assert.rejects(request("items"), (error) => {
      assert.equal(error.status, status);
      assert.equal(errorKind(error), "server");
      assert.equal(isRetryable(error), true);

      return true;
    });

    assert.equal(isSessionExpired(), false);

    assert.deepEqual(calls, ["/api/test/items", "/api/auth/refresh"]);
  });
}

test("refresh network failures and aborts propagate without expiring the session", async () => {
  for (const error of [new TypeError("Failed to fetch"), new DOMException("Aborted", "AbortError")]) {
    globalThis.fetch = async (url) => {
      if (url === "/api/auth/refresh") {
        throw error;
      }

      return new Response(null, { status: 401 });
    };

    markSignedIn();

    await assert.rejects(request("items"), (failure) => {
      assert.equal(failure, error);
      assert.equal(isRetryable(failure), error instanceof TypeError);

      return true;
    });

    assert.equal(isSessionExpired(), false);
  }
});
