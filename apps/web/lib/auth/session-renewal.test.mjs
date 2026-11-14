import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  readSessionWithRenewal,
  RECENT_ROTATION_MS,
  renewSession,
} from "./session-renewal.ts";

/** Web Locks stand-in: requests for a held lock wait for it, as in browsers. */
function createLocks() {
  let tail = Promise.resolve();

  return {
    request(name, callback) {
      const run = tail.then(() => callback({ name }));
      tail = run.catch(() => {});

      return run;
    },
  };
}

function createStorage() {
  const items = new Map();

  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => items.set(key, value),
  };
}

function createEnvironment(clock = { now: 1_000_000 }) {
  return {
    locks: createLocks(),
    storage: createStorage(),
    now: () => clock.now,
  };
}

const unauthorized = Object.assign(new Error("Sign in."), { status: 401 });

test("an expired access token is renewed once and the session read succeeds", async () => {
  const environment = createEnvironment();
  const calls = [];

  const session = await readSessionWithRenewal(
    async () => {
      calls.push("me");
      throw unauthorized;
    },
    async () => {
      calls.push("refresh");

      return { user: { id: "u1" } };
    },
    environment,
  );

  assert.deepEqual(session, { user: { id: "u1" } });
  assert.deepEqual(calls, ["me", "refresh"]);
});

test("two tabs renewing together rotate the refresh token only once", async () => {
  const environment = createEnvironment();
  const calls = [];
  const refresh = async () => {
    calls.push("refresh");

    return "renewed";
  };
  const read = async () => {
    calls.push("me");

    return "read";
  };

  const results = await Promise.all([
    renewSession(refresh, read, environment),
    renewSession(refresh, read, environment),
  ]);

  assert.deepEqual(results, ["renewed", "read"]);
  assert.deepEqual(calls, ["refresh", "me"]);
});

test("after the recent-rotation window a tab renews again", async () => {
  const clock = { now: 1_000_000 };
  const environment = createEnvironment(clock);
  const calls = [];
  const refresh = async () => {
    calls.push("refresh");

    return "renewed";
  };
  const read = async () => "read";

  await renewSession(refresh, read, environment);
  clock.now += RECENT_ROTATION_MS + 1;
  await renewSession(refresh, read, environment);

  assert.deepEqual(calls, ["refresh", "refresh"]);
});

test("other failures are not treated as an expired session", async () => {
  const environment = createEnvironment();
  const outage = Object.assign(new Error("Unavailable."), { status: 503 });
  let refreshed = false;

  const reading = readSessionWithRenewal(
    async () => {
      throw outage;
    },
    async () => {
      refreshed = true;
    },
    environment,
  );

  await assert.rejects(reading, outage);
  assert.equal(refreshed, false);
});

test("a rejected refresh reports the session as signed out", async () => {
  const environment = createEnvironment();

  const reading = readSessionWithRenewal(
    async () => {
      throw unauthorized;
    },
    async () => {
      throw unauthorized;
    },
    environment,
  );

  await assert.rejects(reading, { status: 401 });
});
