import { strict as assert } from "node:assert";
import { test } from "node:test";
import { openExecutionStream } from "./execution-stream.ts";

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

function createHarness({ ticketUrl = "wss://stream.test/ticket" } = {}) {
  const sockets = [];
  const timers = [];
  const snapshots = [];
  const states = [];
  const refreshes = [];

  const options = {
    executionId: "exec-1",
    requestTicket: async () => ({ url: ticketUrl }),
    createSocket: (url) => {
      const socket = {
        url,
        sent: [],
        closed: false,
        onopen: null,
        onmessage: null,
        onclose: null,
        send(data) {
          this.sent.push(data);
        },
        close() {
          this.closed = true;
        },
      };
      sockets.push(socket);

      return socket;
    },
    onSnapshot: (value) => snapshots.push(value),
    onRefreshNeeded: () => refreshes.push(true),
    onState: (state) => states.push(state),
    timers: {
      set: (callback, milliseconds) => {
        timers.push({ callback, milliseconds });

        return timers.length;
      },
      clear: () => {},
    },
  };

  return { options, sockets, timers, snapshots, states, refreshes };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test("delivers only valid snapshots of the followed execution", async () => {
  const harness = createHarness();
  openExecutionStream(harness.options);
  await flush();
  const [socket] = harness.sockets;

  socket.onopen();
  socket.onmessage({ data: JSON.stringify(snapshot({ sequence: 2 })) });
  socket.onmessage({ data: "not json" });
  socket.onmessage({ data: JSON.stringify({ id: "exec-1", sequence: "3" }) });
  socket.onmessage({
    data: JSON.stringify(snapshot({ id: "other", sequence: 4 })),
  });

  assert.deepEqual(harness.states, ["connecting", "live"]);
  assert.deepEqual(socket.sent, [JSON.stringify({ action: "resume" })]);
  assert.equal(harness.snapshots.length, 1);
  assert.equal(harness.snapshots[0].sequence, 2);
});

test("reconnects with backoff after a close and gives up after the limit", async () => {
  const harness = createHarness();
  openExecutionStream({ ...harness.options, maxReconnects: 2 });
  await flush();

  harness.sockets[0].onclose();
  harness.timers[0].callback();
  await flush();
  harness.sockets[1].onclose();
  harness.timers[1].callback();
  await flush();
  harness.sockets[2].onclose();

  assert.equal(harness.sockets.length, 3);
  assert.deepEqual(
    harness.timers.map((timer) => timer.milliseconds),
    [2000, 4000],
  );
  assert.deepEqual(harness.states, ["connecting", "down", "down", "down"]);
});

test("reports an unavailable stream when the deployment offers no socket", async () => {
  const harness = createHarness({ ticketUrl: null });

  openExecutionStream(harness.options);
  await flush();

  assert.equal(harness.sockets.length, 0);
  assert.deepEqual(harness.states, ["connecting", "unavailable"]);
});

test("stopping closes the socket without scheduling a reconnect", async () => {
  const harness = createHarness();
  const stop = openExecutionStream(harness.options);
  await flush();
  const [socket] = harness.sockets;

  stop();

  assert.equal(socket.closed, true);
  assert.equal(socket.onclose, null);
  assert.equal(harness.timers.length, 0);
});

test("a trimmed frame asks for the full snapshot instead of applying its sequence", async () => {
  const harness = createHarness();
  openExecutionStream(harness.options);
  await flush();
  const [socket] = harness.sockets;
  const trimmed = snapshot({
    status: "completed",
    sequence: 9,
    grounding: null,
    requiresRefresh: true,
  });

  socket.onopen();
  socket.onmessage({ data: JSON.stringify(trimmed) });

  assert.equal(harness.snapshots.length, 0);
  assert.equal(harness.refreshes.length, 1);
});
