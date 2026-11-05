import type { NextRequest } from "next/server";
import { proxyCore } from "../../core-proxy";

const ID = "[a-fA-F0-9-]{36}";

// The item list itself, one item, its accept action, or a workspace's conversations.
const RESOURCE = new RegExp(
  `^((${ID})(\\/accept)?|workspaces\\/${ID}\\/conversations)?$`,
);

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/memory/[[...path]]">,
) {
  const { path = [] } = await context.params;
  const resource = path.join("/");

  if (!RESOURCE.test(resource)) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  const target = resource ? `memory/${resource}` : "memory";

  return proxyCore(request, target);
}

export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };
