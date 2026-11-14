import type * as Monaco from "monaco-editor";

export type CursorPosition = { line: number; column: number };

type Reveal = { path: string; line: number };

type TextareaTarget = {
  element: HTMLTextAreaElement;
  onChange: (value: string) => void;
};

const HIGHLIGHT_MS = 2000;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

// Character offset where a 1-based line starts in plain text.
function lineStart(lines: string[], line: number) {
  return lines
    .slice(0, line - 1)
    .reduce((sum, text) => sum + text.length + 1, 0);
}

/**
 * Imperative bridge to whichever editor is showing (Monaco or the plain text fallback):
 * reveal a line, insert text at the cursor, focus, and a tiny cursor store for the
 * status bar so cursor moves do not re-render the IDE.
 */
export function createEditorController() {
  let editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  let monaco: typeof Monaco | null = null;
  let textarea: TextareaTarget | null = null;
  let shownPath: string | null = null;
  let pendingReveal: Reveal | null = null;
  let highlight: Monaco.editor.IEditorDecorationsCollection | null = null;
  let highlightTimer: ReturnType<typeof setTimeout> | undefined;
  let cursor: CursorPosition | null = null;
  const listeners = new Set<() => void>();

  function setCursor(next: CursorPosition | null) {
    if (next?.line === cursor?.line && next?.column === cursor?.column) {
      return;
    }

    cursor = next;

    for (const listener of listeners) {
      listener();
    }
  }

  function revealInMonaco(line: number) {
    const model = editor?.getModel();

    if (!editor || !monaco || !model) {
      return;
    }

    const target = clamp(line, 1, model.getLineCount());

    editor.revealLineInCenter(target);
    editor.setPosition({ lineNumber: target, column: 1 });

    clearTimeout(highlightTimer);
    highlight?.clear();
    highlight = editor.createDecorationsCollection([
      {
        range: new monaco.Range(target, 1, target, 1),
        options: { isWholeLine: true, className: "bg-primary/25" },
      },
    ]);
    highlightTimer = setTimeout(() => highlight?.clear(), HIGHLIGHT_MS);

    editor.focus();
  }

  function revealInTextarea(line: number) {
    if (!textarea) {
      return;
    }

    const { element } = textarea;
    const lines = element.value.split("\n");
    const target = clamp(line, 1, lines.length);
    const start = lineStart(lines, target);

    element.focus();
    element.setSelectionRange(start, start + lines[target - 1].length);
  }

  function tryReveal() {
    if (!pendingReveal || pendingReveal.path !== shownPath) {
      return;
    }

    const { line } = pendingReveal;

    if (editor) {
      pendingReveal = null;
      revealInMonaco(line);
    } else if (textarea) {
      pendingReveal = null;
      revealInTextarea(line);
    }
  }

  return {
    attachMonaco(
      instance: Monaco.editor.IStandaloneCodeEditor,
      api: typeof Monaco,
    ) {
      editor = instance;
      monaco = api;
      tryReveal();
    },

    detachMonaco(instance: Monaco.editor.IStandaloneCodeEditor) {
      if (editor === instance) {
        editor = null;
        setCursor(null);
      }
    },

    attachTextarea(
      element: HTMLTextAreaElement,
      onChange: (value: string) => void,
    ) {
      textarea = { element, onChange };
      tryReveal();
    },

    detachTextarea(element: HTMLTextAreaElement) {
      if (textarea?.element === element) {
        textarea = null;
      }
    },

    /** Called by the visible editor once it shows `path`. */
    pathShown(path: string | null) {
      shownPath = path;
      tryReveal();
    },

    /** Reveals and briefly highlights `line` as soon as `path` is showing. */
    reveal(path: string, line: number) {
      pendingReveal = { path, line };
      tryReveal();
    },

    /** Inserts text at the cursor (replacing a selection); false when no editor is showing. */
    insert(text: string) {
      if (editor) {
        const selection = editor.getSelection();

        if (!selection) {
          return false;
        }

        editor.pushUndoStop();
        editor.executeEdits("papert-insert", [
          { range: selection, text, forceMoveMarkers: true },
        ]);
        editor.pushUndoStop();
        editor.focus();

        return true;
      }

      if (textarea) {
        const { element, onChange } = textarea;
        const start = element.selectionStart;
        const end = element.selectionEnd;
        const value = `${element.value.slice(0, start)}${text}${element.value.slice(end)}`;

        onChange(value);

        requestAnimationFrame(() => {
          element.focus();
          element.setSelectionRange(start + text.length, start + text.length);
        });

        return true;
      }

      return false;
    },

    focus() {
      if (editor) {
        editor.focus();
      } else {
        textarea?.element.focus();
      }
    },

    setCursor,

    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    getCursor() {
      return cursor;
    },
  };
}

export type EditorController = ReturnType<typeof createEditorController>;
