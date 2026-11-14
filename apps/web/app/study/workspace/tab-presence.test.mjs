import { strict as assert } from "node:assert";
import { test } from "node:test";
import { joinTabPresence } from "./tab-presence.ts";

/** Delivers each message synchronously to every other channel, like a BroadcastChannel. */
function createBus() {
  const channels = new Set();

  return function open() {
    const channel = {
      onmessage: null,
      postMessage(message) {
        for (const other of channels) {
          if (other !== channel) {
            other.onmessage?.({ data: structuredClone(message) });
          }
        }
      },
      close() {
        channels.delete(channel);
      },
    };
    channels.add(channel);

    return channel;
  };
}

function openTab(open, tabId) {
  const state = { others: [], saves: [] };
  const presence = joinTabPresence({
    channel: open(),
    tabId,
    onOthersChange: (others) => {
      state.others = others;
    },
    onSavedElsewhere: (revision) => state.saves.push(revision),
  });

  return { state, presence };
}

test("two tabs on one workspace notice each other and the one that leaves", () => {
  const open = createBus();
  const first = openTab(open, "tab-1");
  const second = openTab(open, "tab-2");

  const bothOpen = [first.state.others, second.state.others];
  second.presence.leave();

  assert.deepEqual(bothOpen, [["tab-2"], ["tab-1"]]);
  assert.deepEqual(first.state.others, []);
});

test("a save in one tab reaches the other tabs, not itself", () => {
  const open = createBus();
  const first = openTab(open, "tab-1");
  const second = openTab(open, "tab-2");

  first.presence.announceSaved(7);

  assert.deepEqual(second.state.saves, [7]);
  assert.deepEqual(first.state.saves, []);
});

test("malformed messages are ignored", () => {
  const open = createBus();
  const tab = openTab(open, "tab-1");
  const stranger = open();

  stranger.postMessage({ type: "saved", tabId: "tab-9", revision: "7" });
  stranger.postMessage({ type: "unknown", tabId: "tab-9" });
  stranger.postMessage(null);

  assert.deepEqual(tab.state.others, []);
  assert.deepEqual(tab.state.saves, []);
});
