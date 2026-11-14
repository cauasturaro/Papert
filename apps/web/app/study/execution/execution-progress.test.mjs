import { strict as assert } from "node:assert";
import { test } from "node:test";

// Query timers only run in a browser-like global; set it before the library loads.
globalThis.window ??= {};

const { QueryClient, QueryObserver } = await import("@tanstack/react-query");
const {
  connectionOf,
  executionQueryOptions,
  FIRST_POLL_MS,
  keepNewer,
  nextReadDelay,
  RECONCILE_MS,
} = await import("./execution-progress.ts");

const settle = () => new Promise((resolve) => setImmediate(resolve));

function snapshot(overrides = {}) {
  return {
    id: "exec-1",
    workspaceId: "ws-1",
    kind: "chat",
    prompt: "Why?",
    status: "running",
    text: "",
    sequence: 1,
    charged: 0,
    reserved: 10,
    ...overrides,
  };
}

test("an open socket still settles the turn when its final push is lost", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  const client = new QueryClient();
  const persisted = [
    snapshot({ sequence: 1 }),
    snapshot({ status: "completed", text: "Because.", sequence: 5 }),
  ];
  let reads = 0;
  const read = async () => {
    const value = persisted[Math.min(reads, persisted.length - 1)];
    reads += 1;

    return value;
  };
  const observer = new QueryObserver(
    client,
    executionQueryOptions("exec-1", read, "live"),
  );
  const unsubscribe = observer.subscribe(() => {});
  await settle();
  const first = observer.getCurrentResult().data;

  t.mock.timers.tick(RECONCILE_MS);
  await settle();
  const settled = observer.getCurrentResult().data;
  t.mock.timers.tick(RECONCILE_MS * 3);
  await settle();

  assert.equal(first.status, "running");
  assert.equal(settled.status, "completed");
  assert.equal(settled.text, "Because.");
  assert.equal(reads, 2);
  unsubscribe();
  client.clear();
});

test("an older HTTP snapshot never replaces a newer pushed one", () => {
  const pushed = snapshot({ sequence: 7, text: "partial answer" });
  const stale = snapshot({ sequence: 3 });

  const kept = keepNewer(pushed, stale);

  assert.equal(kept, pushed);
  assert.equal(keepNewer(undefined, stale), stale);
});

test("reads back off while the socket is down, slow down while live and stop once settled", () => {
  const running = snapshot();
  const finished = snapshot({ status: "completed" });

  assert.equal(nextReadDelay(running, "down", 0), FIRST_POLL_MS);
  assert.equal(nextReadDelay(running, "unavailable", 1), FIRST_POLL_MS * 1.5);
  assert.equal(nextReadDelay(running, "down", 20), 10_000);
  assert.equal(nextReadDelay(running, "live", 0), RECONCILE_MS);
  assert.equal(nextReadDelay(finished, "live", 3), false);
});

test("the channel counts as lost only when both socket and reads fail", () => {
  assert.equal(connectionOf("live", true), "live");
  assert.equal(connectionOf("down", false), "polling");
  assert.equal(connectionOf("down", true), "lost");
  assert.equal(connectionOf("unavailable", true), "lost");
});
