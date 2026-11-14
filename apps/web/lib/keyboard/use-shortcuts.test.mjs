import { strict as assert } from "node:assert";
import { test } from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: [new URL("./use-shortcuts.ts", import.meta.url).pathname],
  bundle: true,
  write: false,
  format: "esm",
  platform: "node",
  plugins: [
    {
      name: "hook-effects",
      setup(builder) {
        builder.onResolve({ filter: /^react$/ }, () => ({
          path: "react",
          namespace: "hooks",
        }));
        builder.onLoad({ filter: /.*/, namespace: "hooks" }, () => ({
          contents: `
          export function useEffect(effect) { effect(); }
          export function useRef(current) { return { current }; }
          export function useSyncExternalStore() {}
        `,
        }));
      },
    },
  ],
});
const { useShortcuts } = await import(
  `data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`
);

test("window shortcuts respect modal isolation, including portaled controls", (context) => {
  let handler;
  let modal = null;
  let calls = 0;
  const documentStub = {
    querySelector(selector) {
      assert.equal(selector, 'dialog[open], [aria-modal="true"]');
      return modal;
    },
  };
  const windowStub = {
    addEventListener(_name, listener) {
      handler = listener;
    },
    removeEventListener() {},
  };
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: windowStub,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: documentStub,
  });
  context.after(() => {
    if (previousWindow) {
      Object.defineProperty(globalThis, "window", previousWindow);
    } else {
      delete globalThis.window;
    }

    if (previousDocument) {
      Object.defineProperty(globalThis, "document", previousDocument);
    } else {
      delete globalThis.document;
    }
  });

  useShortcuts(
    {
      "Ctrl+Enter": () => {
        calls += 1;
      },
    },
    { allowInEditable: true, capture: true },
  );
  const event = {
    key: "Enter",
    code: "Enter",
    ctrlKey: true,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    isComposing: false,
    defaultPrevented: false,
    target: { closest: () => null },
    preventDefault() {
      this.defaultPrevented = true;
    },
  };

  handler({ ...event });
  assert.equal(calls, 1);

  modal = { tagName: "DIALOG", open: true };
  const modalEvent = { ...event };
  handler(modalEvent);
  assert.equal(calls, 1);
  assert.equal(modalEvent.defaultPrevented, false);

  modal = { role: "dialog", "aria-modal": "true" };
  handler({ ...event });
  assert.equal(calls, 1);

  useShortcuts(
    {
      "Ctrl+Enter": () => {
        calls += 1;
      },
    },
    { allowInModal: true },
  );
  handler({ ...event });
  assert.equal(calls, 2);

  modal = null;
  handler({ ...event, isComposing: true });
  handler({ ...event, defaultPrevented: true });
  assert.equal(calls, 2);
});
