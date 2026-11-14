"use client";

import { useEffect, useRef } from "react";
import { useStableCallback } from "../use-stable-callback";
import type { CodeRange } from "./code-editor";
import type { EditorController } from "./editor-controller";

export function PlainTextEditor({
  path,
  value,
  controller,
  onFileChange,
  onSelectionChange,
}: {
  path: string;
  value: string;
  controller: EditorController;
  onFileChange: (path: string, content: string) => void;
  onSelectionChange: (path: string, range: CodeRange | null) => void;
}) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const changeFile = useStableCallback((content: string) => {
    onFileChange(path, content);
  });

  useEffect(() => {
    const element = textarea.current;

    if (!element) {
      return;
    }

    controller.attachTextarea(element, changeFile);

    return () => controller.detachTextarea(element);
  }, [controller, changeFile]);

  useEffect(() => {
    controller.pathShown(path);
  }, [controller, path]);

  function reportSelection(element: HTMLTextAreaElement) {
    const { selectionStart: start, selectionEnd: end } = element;

    if (start === end) {
      onSelectionChange(path, null);
      return;
    }

    const before = element.value.slice(0, start);
    const selected = element.value.slice(start, end);
    const startLine = before.split("\n").length;
    const endLine = startLine + selected.split("\n").length - 1;

    onSelectionChange(path, { start, end, startLine, endLine });
  }

  function reportCursor(element: HTMLTextAreaElement) {
    const before = element.value.slice(0, element.selectionStart);
    const lines = before.split("\n");

    controller.setCursor({
      line: lines.length,
      column: lines[lines.length - 1].length + 1,
    });
  }

  return (
    <textarea
      ref={textarea}
      aria-label={`Code editor: ${path}`}
      className="h-full w-full resize-none bg-card p-4 font-mono text-sm text-foreground focus-visible:outline-none"
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      value={value}
      onChange={(event) => onFileChange(path, event.target.value)}
      onSelect={(event) => {
        const element = event.currentTarget;

        reportSelection(element);
        reportCursor(element);
      }}
    />
  );
}
