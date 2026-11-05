import type { NextRequest } from "next/server";
import { proxyCore } from "../../core-proxy";

const ROADMAP = "[a-z0-9-]{1,100}";

const RESOURCE = new RegExp(
  `^(roadmaps(\\/selection|\\/${ROADMAP}(\\/(publish|vote|start))?)?|publications|library(\\/${ROADMAP})?)$`,
);

async function proxy(
  request: NextRequest,
  context: RouteContext<"/api/community/[...path]">,
) {
  const { path } = await context.params;
  const resource = path.join("/");

  if (!RESOURCE.test(resource)) {
    return Response.json({ message: "Not found." }, { status: 404 });
  }

  // Catalog search, filters, pages and selected ids travel in the query string.
  const query = request.nextUrl.search;

  return proxyCore(request, `community/${resource}${query}`);
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PUT,
  proxy as PATCH,
  proxy as DELETE,
};
