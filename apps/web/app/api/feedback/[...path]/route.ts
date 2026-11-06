import type { NextRequest } from "next/server";
import { proxyCore } from "../../core-proxy";

const ID = "[a-fA-F0-9-]{36}";

// The feedback list (`?executions=…`) or one execution's verdict.
const RESOURCE = new RegExp(`^(list|executions\\/${ID})$`);

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/feedback/[...path]">,
) {
  const { path } = await context.params;
  const resource = path.join("/");

  if (!RESOURCE.test(resource)) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  if (resource === "list") {
    return proxyCore(request, `feedback${request.nextUrl.search}`);
  }

  return proxyCore(request, `feedback/${resource}`);
}

export { proxy as GET, proxy as PUT };
