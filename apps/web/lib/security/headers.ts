type Header = { key: string; value: string };

type HeaderRule = { source: string; headers: Header[] };

// Local object storage from .env.example; deployments list their upload and WebSocket
// hosts in CSP_CONNECT_SRC at build time, when Next records these headers.
const LOCAL_CONNECT_SOURCES = "http://localhost:4566";

/**
 * The page policy. Next's inline bootstrap scripts and the theme script need
 * 'unsafe-inline' without per-request nonces, which would make every prerendered page
 * dynamic. Monaco injects inline styles and runs same-origin module workers; pdf.js may
 * compile WebAssembly.
 */
export function contentSecurityPolicy({
  development,
  connectSources,
}: {
  development: boolean;
  connectSources: string;
}) {
  const scriptSources = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"];

  // React rebuilds server error stacks with eval in development only.
  if (development) {
    scriptSources.push("'unsafe-eval'");
  }

  const connect = ["'self'", ...connectSources.split(/\s+/).filter(Boolean)];

  const directives = [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  return directives.join("; ");
}

const IMMUTABLE = "public, max-age=31536000, immutable";
const REVALIDATE = "no-cache";

/** Security headers for every response, plus caching for the hashed editor assets. */
export function securityHeaders(
  env: Record<string, string | undefined> = process.env,
): HeaderRule[] {
  const development = env.NODE_ENV === "development";
  const policy = contentSecurityPolicy({
    development,
    connectSources: env.CSP_CONNECT_SRC ?? LOCAL_CONNECT_SOURCES,
  });

  const pageHeaders: Header[] = [
    { key: "Content-Security-Policy", value: policy },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
  ];

  // Browsers ignore HSTS over plain HTTP; development stays on localhost.
  if (!development) {
    pageHeaders.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return [
    { source: "/:path*", headers: pageHeaders },
    // Later rules win: manifests name the current hashed files and are always revalidated.
    {
      source: "/monaco/:file*",
      headers: [{ key: "Cache-Control", value: IMMUTABLE }],
    },
    {
      source: "/type-packs/:file*",
      headers: [{ key: "Cache-Control", value: IMMUTABLE }],
    },
    {
      source: "/:dir(monaco|type-packs)/manifest.json",
      headers: [{ key: "Cache-Control", value: REVALIDATE }],
    },
  ];
}
