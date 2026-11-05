import { createJsonRequest } from "@/lib/api/request";
import type { Challenge, Level } from "@/lib/roadmap";

export type Vote = -1 | 0 | 1;

export type CatalogSort = "top" | "new";

/** Public facts about a published roadmap; nothing about its origin. */
export type CatalogCard = {
  id: string;
  title: string;
  description: string;
  level: Level | null;
  authorName: string;
  publishedAt: string;
  stepCount: number;
  concepts: string[];
  upvotes: number;
  downvotes: number;
  score: number;
  myVote: Vote;
  favorited: boolean;
  started: boolean;
  // The viewer published it, so they cannot vote on it.
  own: boolean;
};

export type CatalogDetails = CatalogCard & {
  steps: {
    id: string;
    title: string;
    content: string;
    concepts: string[];
    requires: string[];
    challenge: Challenge;
  }[];
  starterFiles: string[];
};

type CatalogPage = {
  items: CatalogCard[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type CatalogQuery = {
  q: string;
  level: Level | "";
  sort: CatalogSort;
  page: number;
};

export type Tally = Pick<
  CatalogCard,
  "upvotes" | "downvotes" | "score" | "myVote"
>;

type Publication = {
  roadmapId: string;
  authorName: string;
  publishedAt: string;
  upvotes: number;
  downvotes: number;
};

const communityRequest = createJsonRequest({
  base: "/api/community",
  unauthorized: "Please sign in to explore community roadmaps.",
  unavailable: "The community catalog is unavailable. Try again.",
});

function catalogSearch(query: CatalogQuery) {
  const params = new URLSearchParams();

  if (query.q.trim()) {
    params.set("q", query.q.trim());
  }

  if (query.level) {
    params.set("level", query.level);
  }

  params.set("sort", query.sort);
  params.set("page", String(query.page));

  return params.toString();
}

export function listCatalog(query: CatalogQuery) {
  return communityRequest<CatalogPage>(`roadmaps?${catalogSearch(query)}`);
}

export function listSelected(ids: string[]) {
  const list = encodeURIComponent(ids.join(","));

  return communityRequest<CatalogCard[]>(`roadmaps/selection?ids=${list}`);
}

export function getDetails(id: string) {
  return communityRequest<CatalogDetails>(`roadmaps/${id}`);
}

export function vote(id: string, value: Vote) {
  return communityRequest<Tally>(`roadmaps/${id}/vote`, "PUT", { value });
}

export function setFavorite(id: string, favorited: boolean) {
  if (favorited) {
    return communityRequest<{ favorited: boolean }>(`library/${id}`, "PUT", {});
  }

  return communityRequest<{ favorited: boolean }>(
    `library/${id}`,
    "DELETE",
    {},
  );
}

export function listLibrary() {
  return communityRequest<CatalogCard[]>("library");
}

export function startCommunityRoadmap(id: string) {
  return communityRequest<{ roadmapId: string; workspaceId: string }>(
    `roadmaps/${id}/start`,
    "POST",
    {},
  );
}

export function publishRoadmap(id: string, authorName: string) {
  return communityRequest<Publication>(`roadmaps/${id}/publish`, "POST", {
    authorName,
    acknowledged: true,
  });
}

export function listPublications() {
  return communityRequest<Publication[]>("publications");
}

/** The study page opens this workspace on arrival, without starting the roadmap again. */
export function workspaceHref(workspaceId: string) {
  return `/study?workspace=${encodeURIComponent(workspaceId)}`;
}
