import { path, SLUG, UUID, type ProxyRoute } from "./route-table.ts";

const WORKSPACE = `workspaces\\/${UUID}`;

export const authRoutes: ProxyRoute[] = [
  { pattern: path("(register|login|logout|refresh)"), methods: ["POST"] },
  { pattern: path("me"), methods: ["GET"] },
  { pattern: path("sessions", UUID), methods: ["GET"] },
];

export const studyRoutes: ProxyRoute[] = [
  { pattern: path("roadmaps"), methods: ["GET"] },
  { pattern: path("roadmaps", SLUG, "start"), methods: ["POST"] },
  { pattern: path("drafts"), methods: ["GET", "POST"] },
  { pattern: path("drafts", UUID), methods: ["GET", "DELETE"] },
  {
    pattern: path("drafts", UUID, "recommendation", "decline"),
    methods: ["POST"],
  },
  {
    pattern: path(WORKSPACE),
    methods: ["GET", "PUT"],
    // `attempts=recent` limits the read to the latest attempts.
    query: ["response", "attempts"],
  },
  { pattern: path(WORKSPACE, "steps", SLUG), methods: ["GET"] },
  {
    pattern: path(WORKSPACE, "attempts"),
    methods: ["GET", "POST"],
    query: ["cursor", "limit", "stepId"],
  },
  { pattern: path(WORKSPACE, "attempts", UUID), methods: ["GET"] },
  { pattern: path(WORKSPACE, "sources"), methods: ["GET", "POST"] },
  { pattern: path(WORKSPACE, "sources", UUID), methods: ["DELETE"] },
  { pattern: path(WORKSPACE, "sources", UUID, "view"), methods: ["GET"] },
];

export const executionRoutes: ProxyRoute[] = [
  { pattern: path("quota"), methods: ["GET"] },
  {
    pattern: path(WORKSPACE),
    methods: ["GET", "POST"],
    // A workspace's list may be narrowed to one conversation and paged back from `before`.
    query: ["conversation", "before"],
  },
  { pattern: path(UUID), methods: ["GET"] },
  { pattern: path(UUID, "(cancel|ticket)"), methods: ["POST"] },
];

export const communityRoutes: ProxyRoute[] = [
  {
    pattern: path("roadmaps"),
    methods: ["GET"],
    query: ["q", "level", "sort", "page"],
  },
  { pattern: path("roadmaps", "selection"), methods: ["GET"], query: ["ids"] },
  { pattern: path("roadmaps", SLUG), methods: ["GET"] },
  { pattern: path("roadmaps", SLUG, "(publish|start)"), methods: ["POST"] },
  { pattern: path("roadmaps", SLUG, "vote"), methods: ["PUT"] },
  { pattern: path("publications"), methods: ["GET"] },
  { pattern: path("library"), methods: ["GET"] },
  // Listed before library/<slug>, which "page" would also match.
  {
    pattern: path("library", "page"),
    methods: ["GET"],
    query: ["cursor", "limit"],
  },
  { pattern: path("library", SLUG), methods: ["PUT", "DELETE"] },
];

export const feedbackRoutes: ProxyRoute[] = [
  {
    pattern: path("list"),
    methods: ["GET"],
    query: ["executions"],
    upstream: "",
  },
  { pattern: path("executions", UUID), methods: ["PUT", "DELETE"] },
];

export const memoryRoutes: ProxyRoute[] = [
  { pattern: path(), methods: ["GET", "POST"] },
  { pattern: path(UUID), methods: ["PATCH", "DELETE"] },
  { pattern: path(UUID, "accept"), methods: ["POST"] },
  { pattern: path(WORKSPACE, "conversations"), methods: ["GET", "POST"] },
  {
    pattern: path(WORKSPACE, "conversations", "page"),
    methods: ["GET"],
    query: ["cursor", "limit"],
  },
  {
    pattern: path(WORKSPACE, "conversations", UUID),
    methods: ["PATCH", "DELETE"],
  },
];

export const engagementRoutes: ProxyRoute[] = [
  { pattern: path(), methods: ["GET"] },
  { pattern: path("time-zone"), methods: ["PUT"] },
];
