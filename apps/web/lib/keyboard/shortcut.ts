/**
 * Combos are "+"-separated: modifiers (`Mod`, `Ctrl`, `Meta`, `Alt`, `Shift`) then one key,
 * such as "Mod+S", "Mod+Shift+Enter", "Escape", "Mod+\\" or "Mod+1". `Mod` is Cmd on
 * Apple platforms and Ctrl elsewhere.
 */
export type ParsedShortcut = {
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  key: string;
};

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

const KEY_ALIASES: Record<string, string> = {
  esc: "escape",
  return: "enter",
  space: " ",
  up: "arrowup",
  down: "arrowdown",
  left: "arrowleft",
  right: "arrowright",
  del: "delete",
};

// Physical keys for combos whose produced character changes with Shift, Alt or layout.
const KEY_CODES: Record<string, string> = {
  "\\": "Backslash",
  "/": "Slash",
  "[": "BracketLeft",
  "]": "BracketRight",
  ",": "Comma",
  ".": "Period",
  ";": "Semicolon",
  "'": "Quote",
  "`": "Backquote",
  "-": "Minus",
  "=": "Equal",
};

export function isApplePlatform() {
  if (typeof navigator === "undefined") {
    return false;
  }

  const data = (
    navigator as Navigator & { userAgentData?: { platform?: string } }
  ).userAgentData;
  const platform = data?.platform || navigator.platform || navigator.userAgent;

  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function parseShortcut(
  combo: string,
  apple = isApplePlatform(),
): ParsedShortcut {
  // A trailing "+" is the plus key itself ("Mod++").
  const parts = combo.endsWith("++")
    ? [...combo.slice(0, -2).split("+"), "+"]
    : combo.split("+");
  const rawKey = parts.pop() ?? "";
  const modifiers = parts.map((part) => part.trim().toLowerCase());

  const parsed: ParsedShortcut = {
    ctrl: modifiers.includes("ctrl") || modifiers.includes("control"),
    meta: modifiers.includes("meta") || modifiers.includes("cmd"),
    alt: modifiers.includes("alt") || modifiers.includes("option"),
    shift: modifiers.includes("shift"),
    key: KEY_ALIASES[rawKey.toLowerCase()] ?? rawKey.toLowerCase(),
  };

  if (modifiers.includes("mod")) {
    parsed.meta = parsed.meta || apple;
    parsed.ctrl = parsed.ctrl || !apple;
  }

  return parsed;
}

function keyMatches(event: KeyEventLike, key: string) {
  if (event.key.toLowerCase() === key) {
    return true;
  }

  if (/^[a-z]$/.test(key)) {
    return event.code === `Key${key.toUpperCase()}`;
  }

  if (/^[0-9]$/.test(key)) {
    return event.code === `Digit${key}` || event.code === `Numpad${key}`;
  }

  return KEY_CODES[key] !== undefined && event.code === KEY_CODES[key];
}

/** Whether a keydown matches `combo` exactly (no extra modifiers). */
export function matchesShortcut(
  event: KeyEventLike,
  combo: string,
  apple = isApplePlatform(),
) {
  const shortcut = parseShortcut(combo, apple);

  const modifiersMatch =
    event.ctrlKey === shortcut.ctrl &&
    event.metaKey === shortcut.meta &&
    event.altKey === shortcut.alt &&
    event.shiftKey === shortcut.shift;

  if (!modifiersMatch) {
    return false;
  }

  return keyMatches(event, shortcut.key);
}

const APPLE_KEY_LABELS: Record<string, string> = {
  enter: "↩",
  escape: "Esc",
  backspace: "⌫",
  delete: "⌦",
  tab: "⇥",
  " ": "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

const OTHER_KEY_LABELS: Record<string, string> = {
  enter: "Enter",
  escape: "Esc",
  backspace: "Backspace",
  delete: "Delete",
  tab: "Tab",
  " ": "Space",
  arrowup: "↑",
  arrowdown: "↓",
  arrowleft: "←",
  arrowright: "→",
};

function keyLabel(key: string, apple: boolean) {
  const labels = apple ? APPLE_KEY_LABELS : OTHER_KEY_LABELS;

  if (labels[key]) {
    return labels[key];
  }

  return key.length === 1
    ? key.toUpperCase()
    : key[0].toUpperCase() + key.slice(1);
}

/** Display text: "⌘S" / "⇧⌘↩" on Apple platforms, "Ctrl+S" / "Ctrl+Shift+Enter" elsewhere. */
export function formatShortcut(combo: string, apple = isApplePlatform()) {
  const shortcut = parseShortcut(combo, apple);
  const key = keyLabel(shortcut.key, apple);

  if (apple) {
    const symbols = [
      shortcut.ctrl ? "⌃" : "",
      shortcut.alt ? "⌥" : "",
      shortcut.shift ? "⇧" : "",
      shortcut.meta ? "⌘" : "",
    ];

    return `${symbols.join("")}${key}`;
  }

  const names = [
    shortcut.ctrl ? "Ctrl" : null,
    shortcut.meta ? "Win" : null,
    shortcut.alt ? "Alt" : null,
    shortcut.shift ? "Shift" : null,
    key,
  ];

  return names.filter(Boolean).join("+");
}

/** Value for `aria-keyshortcuts`, such as "Meta+S" or "Control+Shift+Enter". */
export function ariaKeyShortcut(combo: string, apple = isApplePlatform()) {
  const shortcut = parseShortcut(combo, apple);
  const key = shortcut.key === " " ? "Space" : keyLabel(shortcut.key, false);

  const names = [
    shortcut.ctrl ? "Control" : null,
    shortcut.meta ? "Meta" : null,
    shortcut.alt ? "Alt" : null,
    shortcut.shift ? "Shift" : null,
    key === "Esc" ? "Escape" : key,
  ];

  return names.filter(Boolean).join("+");
}

/** IME composition keystrokes must never trigger shortcuts. */
export function isComposing(
  event: Pick<KeyboardEvent, "isComposing" | "keyCode">,
) {
  return event.isComposing || event.keyCode === 229;
}

const EDITABLE_SELECTOR =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], .monaco-editor';

/** Whether the event started in a text field, select, contenteditable or Monaco. */
export function isEditableTarget(target: EventTarget | null) {
  if (!target || typeof (target as Element).closest !== "function") {
    return false;
  }

  return (target as Element).closest(EDITABLE_SELECTOR) !== null;
}
