import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { createJsonRequest, RequestError } from "./request.ts";

const request = createJsonRequest({
  base: "/api/test",
  unauthorized: "Sign in.",
  unavailable: "Unavailable.",
});

const realFetch = globalThis.fetch;

function respondWith(response) {
  globalThis.fetch = async () => response;
}

afterEach(() => {
  globalThis.fetch = realFetch;
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

test("replaces any 401 body with the sign-in message", async () => {
  respondWith(Response.json({ message: "jwe expired" }, { status: 401 }));

  await assert.rejects(request("items"), { status: 401, message: "Sign in." });
});
