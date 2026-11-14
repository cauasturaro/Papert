"use client";

import { useSyncExternalStore } from "react";
import type { EditorController } from "./editor-controller";

export function CursorStatus({ controller }: { controller: EditorController }) {
  const cursor = useSyncExternalStore(
    controller.subscribe,
    controller.getCursor,
    () => null,
  );

  if (!cursor) {
    return null;
  }

  return (
    <span className="shrink-0 tabular-nums">
      Ln {cursor.line}, Col {cursor.column}
    </span>
  );
}
