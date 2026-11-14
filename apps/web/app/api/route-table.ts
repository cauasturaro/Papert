export const UUID =
  "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
export const SLUG = "[a-z0-9-]{1,100}";

/** A whole-path pattern from fragments: `path("workspaces", UUID)` matches "workspaces/<uuid>". */
export function path(...segments: string[]) {
  return new RegExp(`^${segments.join("\\/")}$`);
}

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type ProxyRoute = {
  // Matched against the whole path after the API prefix, such as "workspaces/<uuid>".
  pattern: RegExp;
  methods: Method[];
  // Query parameters forwarded to Core; anything else is dropped.
  query?: string[];
  // Core path to call instead of the matched one, relative to the Core prefix.
  upstream?: string;
};

export type RouteMatch =
  | { kind: "not_found" }
  | { kind: "method_not_allowed"; allow: Method[] }
  | { kind: "forward"; resource: string };

function allowedQuery(searchParams: URLSearchParams, keys: string[] = []) {
  const forwarded = new URLSearchParams();

  for (const key of keys) {
    const value = searchParams.get(key);

    if (value !== null) {
      forwarded.set(key, value);
    }
  }

  return forwarded.size > 0 ? `?${forwarded}` : "";
}

/** Decides what one request may reach: a Core resource, a 405 or a 404. */
export function matchRoute(
  routes: ProxyRoute[],
  prefix: string,
  path: string[],
  method: string,
  searchParams: URLSearchParams,
): RouteMatch {
  const resource = path.join("/");
  const route = routes.find((candidate) => candidate.pattern.test(resource));

  if (!route) {
    return { kind: "not_found" };
  }

  if (!route.methods.includes(method as Method)) {
    return { kind: "method_not_allowed", allow: route.methods };
  }

  const target = route.upstream ?? resource;
  const base = target ? `${prefix}/${target}` : prefix;
  const query = allowedQuery(searchParams, route.query);

  return { kind: "forward", resource: `${base}${query}` };
}
