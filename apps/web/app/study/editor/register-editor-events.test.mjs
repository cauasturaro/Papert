import assert from "node:assert/strict";
import { test } from "node:test";
import { registerEditorEvents } from "./register-editor-events.ts";

test("registers editor actions and disposes subscriptions and pending selections", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const listeners = {};
  const actions = new Map();
  const removed = [];
  const events = ["onDidChangeCursorPosition", "onDidChangeCursorSelection", "onDidChangeModel", "onDidDispose"];
  const editor = {
    getModel: () => ({ getOffsetAt: (position) => position.offset }),
    getSelection: () => ({
      isEmpty: () => false,
      getStartPosition: () => ({ offset: 1 }),
      getEndPosition: () => ({ offset: 3 }),
      startLineNumber: 1,
      endLineNumber: 1,
    }),
    addAction: (action) => {
      actions.set(action.id, action);

      return { dispose: () => removed.push(action.id) };
    },
  };

  for (const name of events) {
    editor[name] = (callback) => {
      listeners[name] = callback;

      return { dispose: () => removed.push(name) };
    };
  }

  let saved = 0;
  let asked = 0;
  let selections = 0;
  let detached = 0;
  let cursor;
  const controller = {
    attachMonaco() {},
    detachMonaco() { detached += 1; },
    setCursor(value) { cursor = value; },
  };
  const monaco = { KeyMod: { CtrlCmd: 1, Shift: 2 }, KeyCode: { KeyS: 4, KeyL: 8 } };

  const dispose = registerEditorEvents(editor, monaco, controller, {
    onSave: () => { saved += 1; },
    onAskSeymour: () => { asked += 1; },
    onSelectionChange: () => { selections += 1; },
  });
  actions.get("papert.save").run();
  actions.get("papert.ask-seymour").run();
  listeners.onDidChangeCursorPosition({ position: { lineNumber: 2, column: 3 } });
  listeners.onDidChangeCursorSelection();
  dispose();
  dispose();
  t.mock.timers.tick(200);

  assert.equal(saved, 1);
  assert.equal(asked, 1);
  assert.deepEqual(cursor, { line: 2, column: 3 });
  assert.equal(selections, 0);
  assert.equal(detached, 1);
  assert.equal(removed.length, 6);
});
