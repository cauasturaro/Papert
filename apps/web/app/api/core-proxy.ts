import type { NextRequest } from "next/server";
import { coreApiUrl } from "../../lib/api/core-url.ts";
import { clientAddress, trustedProxyCount } from "./client-address.ts";

const FORWARDED_REQUEST_HEADERS = ["cookie", "origin", "content-type"];
const FORWARDED_RESPONSE_HEADERS = ["content-type", "retry-after"];
const METHODS_WITH_BODY = ["POST", "PUT", "PATCH", "DELETE"];

if (trustedProxyCount() === 0 || !process.env.EDGE_PROXY_SECRET) {
  console.warn(
    "Client address forwarding disabled: configure a trusted ingress and EDGE_PROXY_SECRET. Core will use its immediate peer.",
  );
}

function upstreamHeaders(request: NextRequest) {
  const headers = new Headers();

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  // The allowlist discards browser-supplied proof; only server configuration can add it.
  const client = clientAddress(
    request.headers.get("x-forwarded-for"),
    trustedProxyCount(),
  );

  const secret = process.env.EDGE_PROXY_SECRET;
  if (client && secret) {
    headers.set("x-forwarded-for", client);
    headers.set("x-papert-edge", secret);
  }

  return headers;
}

export async function proxyCore(request: NextRequest, resource: string) {
  try {
    const init: RequestInit = {
      method: request.method,
      headers: upstreamHeaders(request),
      body: METHODS_WITH_BODY.includes(request.method)
        ? await request.text()
        : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    };

    const upstream = await fetch(`${coreApiUrl()}/${resource}`, init);

    // Core's own content type passes through, so a gateway's HTML error page is not
    // relabelled as JSON.
    const responseHeaders = new Headers({ "Cache-Control": "no-store" });

    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);

      if (value) {
        responseHeaders.set(name, value);
      }
    }

    // Each cookie stays its own header; `get` would join them into one invalid value.
    for (const cookie of upstream.headers.getSetCookie()) {
      responseHeaders.append("set-cookie", cookie);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { message: "The service is unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
