import type { NextRequest } from "next/server";
import { proxyCore } from "../../core-proxy";

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/auth/[...path]">,
) {
  const { path } = await context.params;
  const resource = path.join("/");

  if (
    !/^(register|login|logout|refresh|me|sessions\/[a-fA-F0-9-]+)$/.test(
      resource,
    )
  ) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  return proxyCore(request, `auth/${resource}`);
}

export { proxy as GET, proxy as POST };
