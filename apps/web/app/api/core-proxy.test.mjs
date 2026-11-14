import { strict as assert } from "node:assert";
import { afterEach, test } from "node:test";
import { proxyCore } from "./core-proxy.ts";
import { clientAddress } from "./client-address.ts";

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };

afterEach(() => {
  globalThis.fetch = realFetch;
  process.env = { ...realEnv };
});

function captureUpstream(response) {
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });

    return response;
  };

  return calls;
}

test("forwards the client address as a single X-Forwarded-For value", async () => {
  process.env.CORE_API_URL = "http://core.test";
  process.env.TRUSTED_PROXY_COUNT = "1";
  process.env.EDGE_PROXY_SECRET = "server-secret";
  const calls = captureUpstream(Response.json({ ok: true }));
  const request = new Request("http://web.test/api/study/roadmaps", {
    headers: {
      cookie: "papert_session=abc",
      "x-forwarded-for": "6.6.6.6, 203.0.113.7",
      authorization: "Bearer leaked",
      "x-papert-edge": "browser-forgery",
    },
  });

  await proxyCore(request, "study/roadmaps");

  const headers = calls[0].init.headers;
  assert.equal(calls[0].url, "http://core.test/study/roadmaps");
  // Replaces the incoming chain; the spoofed left entry never reaches Core.
  assert.equal(headers.get("x-forwarded-for"), "203.0.113.7");
  assert.equal(headers.get("cookie"), "papert_session=abc");
  assert.equal(headers.get("authorization"), null);
  assert.equal(headers.get("x-papert-edge"), "server-secret");
});

test("keeps the session and refresh cookies as separate Set-Cookie headers", async () => {
  const sessionCookie =
    "papert_session=a; Path=/; Expires=Wed, 11 Nov 2026 10:00:00 GMT; HttpOnly; SameSite=Strict";
  const refreshCookie =
    "papert_refresh=b; Path=/api/auth; Expires=Wed, 25 Nov 2026 10:00:00 GMT; HttpOnly; SameSite=Strict";
  const upstreamHeaders = new Headers({ "content-type": "application/json" });
  upstreamHeaders.append("set-cookie", sessionCookie);
  upstreamHeaders.append("set-cookie", refreshCookie);
  captureUpstream(
    new Response("{}", { status: 200, headers: upstreamHeaders }),
  );
  const request = new Request("http://web.test/api/auth/refresh", {
    method: "POST",
  });

  const response = await proxyCore(request, "auth/refresh");

  assert.deepEqual(response.headers.getSetCookie(), [
    sessionCookie,
    refreshCookie,
  ]);
});

test("passes Core's content type through instead of labelling it JSON", async () => {
  captureUpstream(
    new Response("<html>Bad gateway</html>", {
      status: 502,
      headers: { "content-type": "text/html" },
    }),
  );
  const request = new Request("http://web.test/api/auth/me");

  const response = await proxyCore(request, "auth/me");

  assert.equal(response.status, 502);
  assert.equal(response.headers.get("content-type"), "text/html");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("answers 503 when Core cannot be reached", async () => {
  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const request = new Request("http://web.test/api/auth/me");

  const response = await proxyCore(request, "auth/me");

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    message: "The service is unavailable. Please try again.",
  });
});

test("answers 503 instead of calling localhost when production has no Core URL", async () => {
  delete process.env.CORE_API_URL;
  process.env.NODE_ENV = "production";
  const calls = captureUpstream(Response.json({ ok: true }));
  const request = new Request("http://web.test/api/auth/me");

  const response = await proxyCore(request, "auth/me");

  assert.equal(response.status, 503);
  assert.equal(calls.length, 0);
});

test("the client address skips entries the client wrote itself", () => {
  assert.equal(clientAddress("198.51.100.4", 0), null);
  assert.equal(clientAddress("6.6.6.6, 198.51.100.4", 0), null);
  assert.equal(clientAddress("6.6.6.6, 198.51.100.4", 1), "198.51.100.4");
  assert.equal(
    clientAddress("6.6.6.6, 198.51.100.4, 10.0.0.2", 2),
    "198.51.100.4",
  );
  assert.equal(clientAddress("not-an-ip", 1), null);
  assert.equal(clientAddress("198.51.100.4", 2), null);
  assert.equal(clientAddress(null, 1), null);
});

for (const trustedProxies of ["0", "1"]) {
  test(`drops browser proof and unsafe addresses with ${trustedProxies} proxies`, async () => {
    process.env.TRUSTED_PROXY_COUNT = trustedProxies;
    if (trustedProxies === "0") {
      process.env.EDGE_PROXY_SECRET = "server-secret";
    } else {
      delete process.env.EDGE_PROXY_SECRET;
    }

    const calls = captureUpstream(Response.json({ ok: true }));
    const request = new Request("http://web.test/api/auth/me", {
      headers: {
        "x-forwarded-for": "198.51.100.77",
        "x-papert-edge": "browser-forgery",
      },
    });

    await proxyCore(request, "auth/me");

    assert.equal(calls[0].init.headers.get("x-forwarded-for"), null);
    assert.equal(calls[0].init.headers.get("x-papert-edge"), null);
  });
}
