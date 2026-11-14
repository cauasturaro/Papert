import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_QUERY,
  catalogResultStatus,
  emptyKind,
  netVotes,
  nextVote,
  patchCards,
  pageCount,
  paramsFromQuery,
  queryFromParams,
} from "./catalog-state.ts";

test("reads a query from the URL and drops invalid values", () => {
  const valid = queryFromParams(
    new URLSearchParams("q=nest&level=advanced&sort=new&page=3"),
  );
  const invalid = queryFromParams(
    new URLSearchParams("level=expert&sort=hot&page=-2"),
  );

  assert.deepEqual(valid, {
    q: "nest",
    level: "advanced",
    sort: "new",
    page: 3,
  });
  assert.deepEqual(invalid, DEFAULT_QUERY);
});

test("writes only non-default parameters", () => {
  const plain = paramsFromQuery(DEFAULT_QUERY);
  const filtered = paramsFromQuery({
    q: " sql ",
    level: "beginner",
    sort: "top",
    page: 2,
  });

  assert.equal(plain, "");
  assert.equal(filtered, "q=sql&level=beginner&page=2");
});

test("toggles and switches votes", () => {
  assert.equal(nextVote(0, 1), 1);
  assert.equal(nextVote(1, 1), 0);
  assert.equal(nextVote(1, -1), -1);
  assert.equal(nextVote(-1, -1), 0);
});

test("counts pages and net votes", () => {
  assert.equal(pageCount(0, 12), 1);
  assert.equal(pageCount(25, 12), 3);
  assert.equal(netVotes({ upvotes: 4, downvotes: 6 }), -2);
});

test("tells an empty catalog from a search without results", () => {
  assert.equal(emptyKind(DEFAULT_QUERY, 0), "empty-catalog");
  assert.equal(emptyKind({ ...DEFAULT_QUERY, q: "rust" }, 0), "no-results");
  assert.equal(
    emptyKind({ ...DEFAULT_QUERY, level: "advanced" }, 0),
    "no-results",
  );
  assert.equal(emptyKind(DEFAULT_QUERY, 3), null);
});

test("patches one card in lists, pages and details", () => {
  const card = { id: "a", myVote: 0, upvotes: 1, favorited: false };
  const other = { ...card, id: "b" };
  const publication = { roadmapId: "a", upvotes: 1 };
  const tally = { myVote: 1, upvotes: 2 };

  const list = patchCards([card, other], "a", tally);
  const page = patchCards({ items: [card], total: 1 }, "a", tally);
  const details = patchCards(card, "a", { favorited: true });
  const publications = patchCards([publication], "a", tally);

  assert.deepEqual(list, [{ ...card, ...tally }, other]);
  assert.deepEqual(page, { items: [{ ...card, ...tally }], total: 1 });
  assert.equal(details.favorited, true);
  assert.deepEqual(publications, [publication]);
});

test("patches one card inside every loaded page of a paged list", () => {
  const card = { id: "a", myVote: 0, upvotes: 1, favorited: true };
  const other = { ...card, id: "b" };
  const loaded = {
    pages: [
      { items: [other], nextCursor: "b" },
      { items: [card], nextCursor: null },
    ],
    pageParams: [null, "b"],
  };

  const patched = patchCards(loaded, "a", { favorited: false });

  assert.deepEqual(patched, {
    pages: [
      { items: [other], nextCursor: "b" },
      { items: [{ ...card, favorited: false }], nextCursor: null },
    ],
    pageParams: [null, "b"],
  });
});

test("result announcements distinguish pages and the final partial range", () => {
  const first = catalogResultStatus(25, 1, 12, 12);
  const second = catalogResultStatus(25, 2, 12, 12);
  const last = catalogResultStatus(25, 3, 12, 1);

  assert.equal(first, "25 roadmaps. Page 1 of 3, showing 1–12");
  assert.equal(second, "25 roadmaps. Page 2 of 3, showing 13–24");
  assert.equal(last, "25 roadmaps. Page 3 of 3, showing 25–25");
  assert.equal(catalogResultStatus(0, 1, 12, 0), "0 roadmaps");
  assert.equal(
    catalogResultStatus(1, 1, 12, 1),
    "1 roadmap. Page 1 of 1, showing 1–1",
  );
});
