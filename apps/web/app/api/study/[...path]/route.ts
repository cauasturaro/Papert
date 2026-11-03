import type { NextRequest } from "next/server";
import { proxyCore } from "../../core-proxy";

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/study/[...path]">,
) {
  const { path } = await context.params;
  const resource = path.join("/");

  if (
    !/^(roadmaps\/[a-z0-9-]{1,100}(\/start)?|workspaces\/[a-fA-F0-9-]{36}(\/attempts|\/steps\/[a-z0-9-]+|\/sources(\/[a-fA-F0-9-]{36})?)?)$/.test(
      resource,
    )
  ) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  return proxyCore(request, `study/${resource}`);
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
