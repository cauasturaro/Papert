import type { CatalogQuery } from "./community-api";

// Every community query key starts here, so one invalidation refreshes cards everywhere.
export const COMMUNITY_KEY = "community";

export function catalogKey(query: CatalogQuery) {
  return [COMMUNITY_KEY, "catalog", query];
}

export function detailsKey(id: string) {
  return [COMMUNITY_KEY, "details", id];
}

export function selectionKey(ids: string[]) {
  return [COMMUNITY_KEY, "selected", ids];
}

export const LIBRARY_KEY = [COMMUNITY_KEY, "library"];

export const PUBLICATIONS_KEY = [COMMUNITY_KEY, "publications"];
