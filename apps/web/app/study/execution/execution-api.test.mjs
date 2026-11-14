import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { executionRequest } from "./execution-api.ts";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("uses GET without a body and POST with a JSON body", async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, ...init });

    return Response.json({ ok: true });
  };

  await executionRequest("quota");
  await executionRequest("job/cancel", {});

  assert.equal(calls[0].url, "/api/executions/quota");
  assert.equal(calls[0].method, "GET");
  assert.equal(calls[0].body, undefined);
  assert.equal(calls[1].method, "POST");
  assert.equal(calls[1].body, "{}");
  assert.equal(calls[1].headers["Content-Type"], "application/json");
});

test("renews an expired access token and retries the same execution request", async () => {
  const calls = [];
  let attempts = 0;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });

    if (url === "/api/auth/refresh") {
      return Response.json({ user: { id: "learner" } });
    }

    attempts += 1;

    return attempts === 1
      ? Response.json({}, { status: 401 })
      : Response.json({ id: "job" });
  };

  const result = await executionRequest("job/cancel", {});

  assert.deepEqual(result, { id: "job" });
  assert.deepEqual(calls.map(({ url }) => url), [
    "/api/executions/job/cancel",
    "/api/auth/refresh",
    "/api/executions/job/cancel",
  ]);
  assert.deepEqual(calls[0].init, calls[2].init);
});

test("preserves session and unavailable messages", async () => {
  globalThis.fetch = async () => Response.json({}, { status: 401 });

  await assert.rejects(executionRequest("quota"), {
    status: 401,
    message: "Your session ended. Sign in again to continue.",
  });

  globalThis.fetch = async () => new Response(null, { status: 503 });

  await assert.rejects(executionRequest("quota"), {
    status: 503,
    message: "Seymour is unavailable right now. Try again in a moment.",
  });
});
