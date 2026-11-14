import type {
  CatalogCard,
  CatalogQuery,
  CatalogSort,
  Tally,
  Vote,
} from "./community-api.ts";

const LEVELS = ["beginner", "intermediate", "advanced"];
const SORTS: CatalogSort[] = ["top", "new"];
const MAX_PAGE = 500;

export const DEFAULT_QUERY: CatalogQuery = {
  q: "",
  level: "",
  sort: "top",
  page: 1,
};

/** Reads the catalog query from the URL, ignoring values Core would reject. */
export function queryFromParams(params: URLSearchParams): CatalogQuery {
  const level = params.get("level") ?? "";
  const sort = params.get("sort") as CatalogSort | null;
  const page = Number(params.get("page") ?? "1");

  return {
    q: (params.get("q") ?? "").slice(0, 200),
    level: LEVELS.includes(level) ? (level as CatalogQuery["level"]) : "",
    sort: sort && SORTS.includes(sort) ? sort : "top",
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
  };
}

/** URL parameters for a query, leaving defaults out so plain /community stays clean. */
export function paramsFromQuery(query: CatalogQuery) {
  const params = new URLSearchParams();

  if (query.q.trim()) {
    params.set("q", query.q.trim());
  }

  if (query.level) {
    params.set("level", query.level);
  }

  if (query.sort !== DEFAULT_QUERY.sort) {
    params.set("sort", query.sort);
  }

  if (query.page > 1) {
    params.set("page", String(query.page));
  }

  return params.toString();
}

/** Clicking the active arrow removes the vote; the other arrow switches it. */
export function nextVote(current: Vote, clicked: 1 | -1): Vote {
  return current === clicked ? 0 : clicked;
}

// Upvotes minus downvotes; the catalog's ranking score is a different number.
export function netVotes(tally: Pick<Tally, "upvotes" | "downvotes">) {
  return tally.upvotes - tally.downvotes;
}

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** Includes page and range so pagination changes the live result announcement. */
export function catalogResultStatus(
  total: number,
  page: number,
  pageSize: number,
  count: number,
) {
  const totalLabel = `${total} ${total === 1 ? "roadmap" : "roadmaps"}`;
  if (count === 0) {
    return totalLabel;
  }

  const first = (page - 1) * pageSize + 1;
  const last = first + count - 1;

  return `${totalLabel}. Page ${page} of ${pageCount(total, pageSize)}, showing ${first}–${last}`;
}

/** Why a page has no cards: nothing published yet, or nothing matching the filters. */
export function emptyKind(query: CatalogQuery, total: number) {
  if (total > 0) {
    return null;
  }

  const filtered = query.q.trim() !== "" || query.level !== "";

  return filtered ? "no-results" : "empty-catalog";
}

export type CardPatch = Partial<Tally & Pick<CatalogCard, "favorited">>;

function isCard(value: unknown): value is CatalogCard {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "myVote" in value
  );
}

function patchOne(value: unknown, id: string, patch: CardPatch) {
  if (isCard(value) && value.id === id) {
    return { ...value, ...patch };
  }

  return value;
}

/** Applies a vote or save result to any cached community data: lists, pages or details. */
export function patchCards(
  data: unknown,
  id: string,
  patch: CardPatch,
): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => patchOne(item, id, patch));
  }

  // A list loaded page by page keeps each page in `pages`.
  if (typeof data === "object" && data !== null && "pages" in data) {
    const loaded = data as { pages: unknown[] };

    return {
      ...loaded,
      pages: loaded.pages.map((page) => patchCards(page, id, patch)),
    };
  }

  if (typeof data === "object" && data !== null && "items" in data) {
    const page = data as { items: unknown[] };

    return {
      ...page,
      items: page.items.map((item) => patchOne(item, id, patch)),
    };
  }

  return patchOne(data, id, patch);
}
