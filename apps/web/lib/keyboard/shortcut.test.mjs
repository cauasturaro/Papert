import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  ariaKeyShortcut,
  formatShortcut,
  isComposing,
  matchesShortcut,
  parseShortcut,
} from "./shortcut.ts";

function key(keyValue, code, modifiers = {}) {
  return {
    key: keyValue,
    code,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  };
}

test("Mod is Cmd on Apple platforms and Ctrl elsewhere", () => {
  assert.deepEqual(parseShortcut("Mod+S", true), {
    ctrl: false,
    meta: true,
    alt: false,
    shift: false,
    key: "s",
  });
  assert.equal(parseShortcut("Mod+S", false).ctrl, true);

  const cmdS = key("s", "KeyS", { metaKey: true });
  const ctrlS = key("s", "KeyS", { ctrlKey: true });

  assert.equal(matchesShortcut(cmdS, "Mod+S", true), true);
  assert.equal(matchesShortcut(ctrlS, "Mod+S", true), false);
  assert.equal(matchesShortcut(ctrlS, "Mod+S", false), true);
});

test("modifiers must match exactly", () => {
  const ctrlShiftS = key("S", "KeyS", { ctrlKey: true, shiftKey: true });

  assert.equal(matchesShortcut(ctrlShiftS, "Mod+S", false), false);
  assert.equal(matchesShortcut(ctrlShiftS, "Mod+Shift+S", false), true);
  assert.equal(matchesShortcut(key("Escape", "Escape"), "Esc", false), true);
  assert.equal(
    matchesShortcut(
      key("Enter", "Enter", { ctrlKey: true }),
      "Mod+Enter",
      false,
    ),
    true,
  );
});

test("physical codes cover layouts and Option characters", () => {
  const optionS = key("ß", "KeyS", { metaKey: true, altKey: true });
  const backslash = key("«", "Backslash", { metaKey: true });
  const shiftedDigit = key("!", "Digit1", { ctrlKey: true, shiftKey: true });

  assert.equal(matchesShortcut(optionS, "Mod+Alt+S", true), true);
  assert.equal(matchesShortcut(backslash, "Mod+\\", true), true);
  assert.equal(matchesShortcut(shiftedDigit, "Mod+Shift+1", false), true);
});

test("labels follow each platform's convention", () => {
  assert.equal(formatShortcut("Mod+S", true), "⌘S");
  assert.equal(formatShortcut("Mod+S", false), "Ctrl+S");
  assert.equal(formatShortcut("Mod+Shift+Enter", true), "⇧⌘↩");
  assert.equal(formatShortcut("Mod+Shift+Enter", false), "Ctrl+Shift+Enter");
  assert.equal(formatShortcut("Mod+\\", false), "Ctrl+\\");
  assert.equal(formatShortcut("Escape", false), "Esc");

  assert.equal(ariaKeyShortcut("Mod+S", true), "Meta+S");
  assert.equal(ariaKeyShortcut("Mod+Enter", false), "Control+Enter");
  assert.equal(ariaKeyShortcut("Esc", false), "Escape");
});

test("IME composition is detected", () => {
  assert.equal(isComposing({ isComposing: true, keyCode: 0 }), true);
  assert.equal(isComposing({ isComposing: false, keyCode: 229 }), true);
  assert.equal(isComposing({ isComposing: false, keyCode: 83 }), false);
});
