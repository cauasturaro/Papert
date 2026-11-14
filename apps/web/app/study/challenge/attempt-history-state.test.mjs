import assert from "node:assert/strict";
import { test } from "node:test";
import { RequestError } from "../../../lib/api/request-error.ts";
import { InfiniteQueryObserver, QueryClient } from "@tanstack/react-query";
import { nextAttemptCursor, unsupportedAttemptHistory, uniqueAttempts } from "./attempt-history-state.ts";

test("only falls back for an identified unsupported endpoint", () => {
  assert.equal(unsupportedAttemptHistory(new RequestError(501, "Not implemented")), true);
  assert.equal(unsupportedAttemptHistory(new RequestError(405, "Method not allowed")), true);
  assert.equal(unsupportedAttemptHistory(new RequestError(404, "Cannot GET /study/workspaces/w/attempts")), true);

  for (const status of [0, 401, 403, 404, 429, 500, 503]) {
    assert.equal(unsupportedAttemptHistory(new RequestError(status, "Unavailable")), false);
  }

  assert.equal(unsupportedAttemptHistory(new Error("Offline")), false);
});

test("merges pages without dropping the newest copy or changing their order", () => {
  const attempts = [{ id: "new", revision: 2 }, { id: "old" }, { id: "new", revision: 1 }];

  const merged = uniqueAttempts(attempts);

  assert.deepEqual(merged, attempts.slice(0, 2));
});


test("keeps the next page available after a transient failure and retries it", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  let unavailable = true;
  const observer = new InfiniteQueryObserver(client, {
    queryKey: ["attempts"],
    initialPageParam: null,
    retry: false,
    getNextPageParam: nextAttemptCursor,
    queryFn: async ({ pageParam }) => {
      if (pageParam === null) {
        return { items: [{ id: "new" }], nextCursor: "older" };
      }

      if (unavailable) {
        throw new Error("Temporarily unavailable");
      }

      return { items: [{ id: "old" }], nextCursor: null };
    },
  });
  await observer.refetch();

  const failed = await observer.fetchNextPage();

  assert.equal(failed.isFetchNextPageError, true);
  assert.equal(failed.hasNextPage, true);
  assert.deepEqual(failed.data.pages[0].items, [{ id: "new" }]);

  unavailable = false;

  const retried = await observer.fetchNextPage();

  assert.equal(retried.isError, false);
  assert.equal(retried.hasNextPage, false);
  assert.deepEqual(retried.data.pages.flatMap((page) => page.items), [{ id: "new" }, { id: "old" }]);

  client.clear();
});

test("stops pagination when a page contains no additional attempts", () => {
  const first = { items: [{ id: "one" }], nextCursor: "one" };
  const repeated = { items: [{ id: "one" }], nextCursor: "one" };

  assert.equal(nextAttemptCursor(first, [first]), "one");
  assert.equal(nextAttemptCursor(repeated, [first, repeated]), null);
});
