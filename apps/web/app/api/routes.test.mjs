import { strict as assert } from "node:assert";
import { test } from "node:test";
import { matchRoute } from "./route-table.ts";
import {
  authRoutes,
  communityRoutes,
  executionRoutes,
  feedbackRoutes,
  memoryRoutes,
  studyRoutes,
} from "./routes.ts";

const WORKSPACE_ID = "0b6f1d0e-6a1c-4c7e-9d6f-2f4e8a1b3c5d";
const EXECUTION_ID = "5a7c9e1b-3d5f-4a6b-8c0d-1e2f3a4b5c6d";

function match(routes, prefix, resource, method = "GET", search = "") {
  const segments = resource === "" ? [] : resource.split("/");

  return matchRoute(
    routes,
    prefix,
    segments,
    method,
    new URLSearchParams(search),
  );
}

test("unknown or traversing study paths are not forwarded", () => {
  const cases = [
    `workspaces/${WORKSPACE_ID}/../admin`,
    `workspaces/${WORKSPACE_ID}/secrets`,
    "workspaces/not-a-uuid",
    "internal/run",
    "",
  ];

  for (const resource of cases) {
    const result = match(studyRoutes, "study", resource);

    assert.deepEqual(result, { kind: "not_found" }, resource);
  }
});

test("a known path with a method it does not support answers 405 with Allow", () => {
  const result = match(studyRoutes, "study", "roadmaps", "DELETE");

  assert.deepEqual(result, { kind: "method_not_allowed", allow: ["GET"] });
});

test("only allowlisted query parameters reach Core", () => {
  const search = "conversation=c1&before=b2&admin=true";

  const result = match(
    executionRoutes,
    "executions",
    `workspaces/${WORKSPACE_ID}`,
    "GET",
    search,
  );

  assert.deepEqual(result, {
    kind: "forward",
    resource: `executions/workspaces/${WORKSPACE_ID}?conversation=c1&before=b2`,
  });
});

test("routes forward only the methods their resource supports", () => {
  const cases = [
    [authRoutes, "auth", "login", "POST", "forward"],
    [authRoutes, "auth", "login", "GET", "method_not_allowed"],
    [authRoutes, "auth", "me", "GET", "forward"],
    [
      executionRoutes,
      "executions",
      EXECUTION_ID,
      "DELETE",
      "method_not_allowed",
    ],
    [
      executionRoutes,
      "executions",
      `${EXECUTION_ID}/ticket`,
      "POST",
      "forward",
    ],
    [
      executionRoutes,
      "executions",
      `${EXECUTION_ID}/delete`,
      "POST",
      "not_found",
    ],
    [communityRoutes, "community", "roadmaps/intro-sql/vote", "PUT", "forward"],
    [
      communityRoutes,
      "community",
      "roadmaps/intro-sql",
      "DELETE",
      "method_not_allowed",
    ],
    [memoryRoutes, "memory", "", "POST", "forward"],
    [memoryRoutes, "memory", EXECUTION_ID, "GET", "method_not_allowed"],
  ];

  for (const [routes, prefix, resource, method, expected] of cases) {
    const result = match(routes, prefix, resource, method);

    assert.equal(result.kind, expected, `${method} ${prefix}/${resource}`);
  }
});

test("the catalog keeps its filters and drops anything else", () => {
  const result = match(
    communityRoutes,
    "community",
    "roadmaps",
    "GET",
    "q=sql&sort=new&page=2&level=beginner&debug=1",
  );

  assert.deepEqual(result, {
    kind: "forward",
    resource: "community/roadmaps?q=sql&level=beginner&sort=new&page=2",
  });
});

test("the feedback list maps to Core's collection path", () => {
  const result = match(
    feedbackRoutes,
    "feedback",
    "list",
    "GET",
    `executions=${EXECUTION_ID}`,
  );

  assert.deepEqual(result, {
    kind: "forward",
    resource: `feedback?executions=${EXECUTION_ID}`,
  });
});

test("session renewal reaches Core's refresh endpoint", () => {
  const result = match(authRoutes, "auth", "refresh", "POST");

  assert.deepEqual(result, { kind: "forward", resource: "auth/refresh" });
});

test("paged lists forward only their cursor and limit", () => {
  const library = match(
    communityRoutes,
    "community",
    "library/page",
    "GET",
    "cursor=c1&limit=20&sort=new",
  );
  const conversations = match(
    memoryRoutes,
    "memory",
    `workspaces/${WORKSPACE_ID}/conversations/page`,
    "GET",
    "limit=10",
  );

  assert.deepEqual(library, {
    kind: "forward",
    resource: "community/library/page?cursor=c1&limit=20",
  });
  assert.deepEqual(conversations, {
    kind: "forward",
    resource: `memory/workspaces/${WORKSPACE_ID}/conversations/page?limit=10`,
  });
  assert.equal(
    match(communityRoutes, "community", "library/page", "DELETE").kind,
    "method_not_allowed",
  );
});

test("the workspace read may ask for recent attempts only", () => {
  const result = match(
    studyRoutes,
    "study",
    `workspaces/${WORKSPACE_ID}`,
    "GET",
    "attempts=recent&debug=1",
  );

  assert.deepEqual(result, {
    kind: "forward",
    resource: `study/workspaces/${WORKSPACE_ID}?attempts=recent`,
  });
});
