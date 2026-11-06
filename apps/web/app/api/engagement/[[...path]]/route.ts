import type { NextRequest } from "next/server";
import { proxyCore } from "../../core-proxy";

// The learner's engagement view, or their time zone.
const RESOURCE = /^(time-zone)?$/;

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/engagement/[[...path]]">,
) {
  const { path = [] } = await context.params;
  const resource = path.join("/");

  if (!RESOURCE.test(resource)) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  const target = resource ? `engagement/${resource}` : "engagement";

  return proxyCore(request, target);
}

export { proxy as GET, proxy as PUT };
