import type * as Monaco from "monaco-editor";
import type { CodeRange } from "./code-editor";
import type { EditorController } from "./editor-controller";

const SELECTION_DELAY_MS = 150;

function readSelection(editor: Monaco.editor.IStandaloneCodeEditor): CodeRange | null {
  const model = editor.getModel();
  const selection = editor.getSelection();

  if (!model || !selection || selection.isEmpty()) {
    return null;
  }

  return {
    start: model.getOffsetAt(selection.getStartPosition()),
    end: model.getOffsetAt(selection.getEndPosition()),
    startLine: selection.startLineNumber,
    endLine: selection.endLineNumber,
  };
}

export function registerEditorEvents(
  editor: Monaco.editor.IStandaloneCodeEditor,
  monaco: typeof Monaco,
  controller: EditorController,
  {
    onSelectionChange,
    onAskSeymour,
    onSave,
  }: {
    onSelectionChange: (range: CodeRange | null) => void;
    onAskSeymour: (range: CodeRange | null) => void;
    onSave: () => void;
  },
) {
  let lastSelection = "";
  let selectionTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  controller.attachMonaco(editor, monaco);

  const cursor = editor.onDidChangeCursorPosition((event) => {
    controller.setCursor({
      line: event.position.lineNumber,
      column: event.position.column,
    });
  });
  const selection = editor.onDidChangeCursorSelection(() => {
    clearTimeout(selectionTimer);

    selectionTimer = setTimeout(() => {
      const range = readSelection(editor);
      const key = range ? `${range.start}:${range.end}` : "";

      if (key === lastSelection) {
        return;
      }

      lastSelection = key;
      onSelectionChange(range);
    }, SELECTION_DELAY_MS);
  });
  const model = editor.onDidChangeModel(() => {
    clearTimeout(selectionTimer);
    lastSelection = "";
  });
  const save = editor.addAction({
    id: "papert.save",
    label: "Save",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    run: onSave,
  });
  const ask = editor.addAction({
    id: "papert.ask-seymour",
    label: "Ask Seymour about this code",
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL,
    ],
    contextMenuGroupId: "navigation",
    contextMenuOrder: 0,
    run: () => {
      onAskSeymour(readSelection(editor));
    },
  });
  const disposal = editor.onDidDispose(dispose);

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    clearTimeout(selectionTimer);
    cursor.dispose();
    selection.dispose();
    model.dispose();
    save.dispose();
    ask.dispose();
    disposal.dispose();
    controller.detachMonaco(editor);
  }

  return dispose;
}
