import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  stdin: {
    contents: `
      export { useCountdown } from "./composer-hooks";
      export { useConversationDraft } from "./use-conversation-draft";
      export { useConversationScope } from "./use-conversation-scope";
      export { useConversationTranscript } from "./use-conversation-transcript";
      export { useSeymourSending } from "./use-seymour-sending";
    `,
    resolveDir: new URL(".", import.meta.url).pathname,
  },
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [{
    name: "conversation-dependencies",
    setup(builder) {
      builder.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "hooks" }));
      builder.onLoad({ filter: /.*/, namespace: "hooks" }, () => ({
        contents: ["useState", "useRef", "useMemo", "useCallback", "useEffect", "useLayoutEffect", "useSyncExternalStore"]
          .map((name) => `export const ${name} = (...args) => globalThis.conversationHooks.${name}(...args);`)
          .join("\n"),
      }));
      builder.onResolve({ filter: /execution-api$/ }, () => ({ path: "request", namespace: "request" }));
      builder.onLoad({ filter: /.*/, namespace: "request" }, () => ({
        contents: "export const executionRequest = (...args) => globalThis.conversationRequest(...args);",
      }));
    },
  }],
});
const hooks = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function harness(hook) {
  const slots = [];
  let cursor;
  let pending;
  let dirty;
  let result;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const runtime = {
    useState(initial) {
      const index = cursor++;
      slots[index] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[index].value, (value) => {
        const next = typeof value === "function" ? value(slots[index].value) : value;
        dirty ||= !Object.is(next, slots[index].value);
        slots[index].value = next;
      }];
    },
    useRef(current) {
      const index = cursor++;
      slots[index] ??= { current };
      return slots[index];
    },
    useMemo(create, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        slots[index] = { value: create(), deps };
      }
      return slots[index].value;
    },
    useCallback(callback, deps) {
      return runtime.useMemo(() => callback, deps);
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        pending.push(() => {
          slots[index]?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
    useLayoutEffect(effect, deps) {
      runtime.useEffect(effect, deps);
    },
  };

  return {
    render() {
      globalThis.conversationHooks = runtime;
      do {
        dirty = false;
        cursor = 0;
        pending = [];
        result = hook();
        for (const commit of pending) {
          commit();
        }
      } while (dirty);
      return result;
    },
    unmount() {
      for (const slot of slots) {
        slot?.cleanup?.();
      }
    },
  };
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("pending draft text flushes under its original key on switch and unmount", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const storage = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } };
  context.after(() => {
    globalThis.window = previousWindow;
  });
  let conversation = "a";
  const view = harness(() => hooks.useConversationDraft("workspace", conversation));
  view.render().setPrompt("last keystrokes");
  view.render();

  conversation = "b";
  const next = view.render();

  assert.equal(storage.get("papert:seymour-draft:workspace:a"), "last keystrokes");
  assert.equal(next.prompt, "");

  next.setPrompt("another draft");
  view.render();
  view.unmount();

  assert.equal(storage.get("papert:seymour-draft:workspace:b"), "another draft");
});

test("scope invalidates old operations even after returning to the same conversation", () => {
  let conversation = "a";
  const view = harness(() => hooks.useConversationScope("workspace", conversation));
  const original = view.render();

  conversation = "b";
  const second = view.render();
  conversation = "a";
  const returned = view.render();

  assert.equal(original(), false);
  assert.equal(second(), false);
  assert.equal(returned(), true);

  view.unmount();

  assert.equal(returned(), false);
});

test("a late send cannot install a job or adopt a conversation after switching", async () => {
  const response = deferred();
  globalThis.conversationRequest = () => response.promise;
  let current = true;
  const calls = [];
  const view = harness(() => hooks.useSeymourSending({
    workspaceId: "workspace",
    conversationId: "a",
    isCurrent: () => current,
    execution: null,
    running: false,
    error: null,
    setError: () => {},
    setHistory: () => calls.push("history"),
    setJob: () => calls.push("job"),
    adoptConversation: () => calls.push("transcript"),
    adoptDraft: () => calls.push("draft"),
    onCreated: () => calls.push("adopt"),
    refreshQuota: () => calls.push("quota"),
    setPrompt: () => calls.push("prompt"),
  }));
  const sending = view.render().dispatch({ prompt: "question", requestKey: "same-key" });

  current = false;
  response.resolve({ id: "old-job", conversationId: "a" });
  const sent = await sending;

  assert.equal(sent, false);
  assert.deepEqual(calls, []);
  view.unmount();
});

test("a late earlier page cannot enter the selected conversation", async () => {
  const earlier = deferred();
  const jobs = Array.from({ length: 100 }, (_, index) => ({ id: `a-${index}`, kind: "chat" }));
  globalThis.conversationRequest = (url) => {
    if (url.includes("before=")) {
      return earlier.promise;
    }
    return Promise.resolve(url.includes("conversation=a") ? jobs : [{ id: "b-latest", kind: "chat" }]);
  };
  let conversationId = "a";
  const view = harness(() => {
    const isCurrent = hooks.useConversationScope("workspace", conversationId);
    return hooks.useConversationTranscript({ workspaceId: "workspace", conversationId, reloadNonce: 0, isCurrent, setError });
  });
  const setError = () => {};
  view.render();
  await settle();
  const loading = view.render().loadEarlier();

  conversationId = "b";
  view.render();
  await settle();
  earlier.resolve([{ id: "old-page", kind: "chat" }]);
  await loading;
  const selected = view.render();

  assert.equal(selected.job.id, "b-latest");
  assert.deepEqual(selected.history, []);
  assert.equal(selected.loadingEarlier, false);
  view.unmount();
});

test("adopting the first conversation preserves text typed while sending", (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const storage = new Map();
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: {
    getItem: (key) => storage.get(key),
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  } };
  context.after(() => { globalThis.window = previousWindow; });
  let conversation = null;
  const view = harness(() => hooks.useConversationDraft("workspace", conversation));
  view.render().setPrompt("follow up typed during send");
  const composing = view.render();

  composing.adoptDraft("created");
  conversation = "created";
  const adopted = view.render();
  view.unmount();

  assert.equal(adopted.prompt, "follow up typed during send");
  assert.equal(storage.get("papert:seymour-draft:workspace:created"), adopted.prompt);
});

test("countdown stops its clock at zero and resumes for a new deadline", (context) => {
  context.mock.timers.enable({ apis: ["setInterval", "Date"], now: 0 });
  const clear = context.mock.method(globalThis, "clearInterval");
  const schedule = context.mock.method(globalThis, "setInterval");
  let until = 3000;
  const view = harness(() => hooks.useCountdown(until));
  assert.equal(view.render(), 3000);

  context.mock.timers.tick(3000);
  const expired = view.render();
  context.mock.timers.tick(10000);

  assert.equal(expired, 0);
  assert.equal(view.render(), 0);
  assert.equal(schedule.mock.callCount(), 1);
  assert.equal(clear.mock.callCount(), 1);

  until = 15000;
  const resumed = view.render();

  assert.equal(resumed, 2000);
  assert.equal(schedule.mock.callCount(), 2);
  view.unmount();
});
