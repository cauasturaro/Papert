import type { NextRequest } from "next/server";
import { proxyCore } from "./core-proxy";
import { matchRoute, type ProxyRoute } from "./route-table.ts";

type CatchAllContext = { params: Promise<{ path?: string[] }> };

/**
 * One BFF route handler: only allowlisted paths, methods and query parameters reach Core
 * under `prefix`; everything else is answered here.
 */
export function createProxyRoute(prefix: string, routes: ProxyRoute[]) {
  return async function proxy(request: NextRequest, context: CatchAllContext) {
    const { path = [] } = await context.params;

    const match = matchRoute(
      routes,
      prefix,
      path,
      request.method,
      request.nextUrl.searchParams,
    );

    if (match.kind === "not_found") {
      return Response.json({ message: "Not found." }, { status: 404 });
    }

    if (match.kind === "method_not_allowed") {
      return Response.json(
        { message: "Method not allowed." },
        { status: 405, headers: { Allow: match.allow.join(", ") } },
      );
    }

    return proxyCore(request, match.resource);
  };
}
