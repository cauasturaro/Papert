import { strict as assert } from "node:assert";
import { test } from "node:test";
import { contentSecurityPolicy, securityHeaders } from "./headers.ts";

function headerOf(rule, key) {
  return rule.headers.find((header) => header.key === key)?.value;
}

test("pages cannot be framed, embed plugins or rewrite the base URL", () => {
  const [pages] = securityHeaders({ NODE_ENV: "production" });

  const policy = headerOf(pages, "Content-Security-Policy");

  assert.equal(pages.source, "/:path*");
  assert.match(policy, /frame-ancestors 'none'/);
  assert.match(policy, /object-src 'none'/);
  assert.match(policy, /base-uri 'none'/);
  assert.match(policy, /worker-src 'self' blob:/);
  assert.doesNotMatch(policy, /'unsafe-eval'/);
  assert.equal(headerOf(pages, "X-Frame-Options"), "DENY");
  assert.equal(
    headerOf(pages, "Referrer-Policy"),
    "strict-origin-when-cross-origin",
  );
  assert.match(headerOf(pages, "Strict-Transport-Security"), /max-age=\d+/);
});

test("development allows eval for React's error overlay and skips HSTS", () => {
  const [pages] = securityHeaders({ NODE_ENV: "development" });

  assert.match(headerOf(pages, "Content-Security-Policy"), /'unsafe-eval'/);
  assert.equal(headerOf(pages, "Strict-Transport-Security"), undefined);
});

test("deployments list their upload and stream hosts for connect-src", () => {
  const policy = contentSecurityPolicy({
    development: false,
    connectSources: "https://uploads.example.com  wss://stream.example.com",
  });

  assert.match(
    policy,
    /connect-src 'self' https:\/\/uploads\.example\.com wss:\/\/stream\.example\.com;/,
  );
});

test("hashed editor assets are immutable while their manifests revalidate", () => {
  const rules = securityHeaders({ NODE_ENV: "production" });

  const cacheRules = rules
    .filter((rule) => headerOf(rule, "Cache-Control"))
    .map((rule) => [rule.source, headerOf(rule, "Cache-Control")]);

  assert.deepEqual(cacheRules, [
    ["/monaco/:file*", "public, max-age=31536000, immutable"],
    ["/type-packs/:file*", "public, max-age=31536000, immutable"],
    ["/:dir(monaco|type-packs)/manifest.json", "no-cache"],
  ]);
});
