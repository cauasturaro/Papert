import type { NextRequest } from "next/server";
import { proxyCore } from "../../core-proxy";

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/executions/[...path]">,
) {
  const { path } = await context.params;
  const resource = path.join("/");

  if (
    !/^(quota|workspaces\/[a-fA-F0-9-]{36}|[a-fA-F0-9-]{36}(\/(cancel|ticket))?)$/.test(
      resource,
    )
  ) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  return proxyCore(request, `executions/${resource}`);
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
