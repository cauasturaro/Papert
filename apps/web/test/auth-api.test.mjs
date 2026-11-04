import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthRequestError,
  checkSession,
  logout,
  submitCredentials,
} from "../lib/auth/auth-api.ts";

test("credential requests preserve endpoints, body and server errors", async (t) => {
  const calls = [];
  const credentials = { email: "a@example.com", password: "study123" };
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);

    return Response.json({ message: "Invalid credentials" }, { status: 400 });
  });

  for (const register of [false, true]) {
    await assert.rejects(submitCredentials(register, credentials), (error) => {
      assert.ok(error instanceof AuthRequestError);
      assert.equal(error.status, 400);
      assert.equal(error.message, "Invalid credentials");

      return true;
    });
  }

  assert.deepEqual(
    calls,
    ["login", "register"].map((action) => [
      `/api/auth/${action}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
      },
    ]),
  );
});

test("session reads and renewals retain request options and expiry messages", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);

    return Response.json({}, { status: 401 });
  });

  for (const refresh of [false, true]) {
    await assert.rejects(checkSession(refresh), {
      status: 401,
      message:
        "Please sign in to continue. If your session expired, sign in again to return here.",
    });
  }

  assert.deepEqual(calls, [
    [
      "/api/auth/me",
      { method: "GET", cache: "no-store", headers: {}, body: undefined },
    ],
    [
      "/api/auth/refresh",
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      },
    ],
  ]);
});

test("logout accepts 204 and 401 without parsing JSON and rejects other failures", async (t) => {
  let status = 204;
  const calls = [];
  t.mock.method(globalThis, "fetch", async (...args) => {
    calls.push(args);

    return new Response(null, { status });
  });

  await logout();
  status = 401;

  await logout();
  status = 500;

  await assert.rejects(logout(), {
    status: 500,
    message: "We could not sign you out. Please try again.",
  });

  assert.deepEqual(calls[0], [
    "/api/auth/logout",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  ]);
});
