"use client";

import type { RefObject } from "react";
import { DropdownMenuItem } from "../dropdown-menu/dropdown-menu";
import { ContextMenuItem } from "../context-menu/context-menu";
import { TreeEditorActionItems } from "./tree-editor-actions";
import { isLastSibling } from "./tree-editor-positions";
import type { useTreeEditing } from "./use-tree-editing";

type ActionMenuProps<T> = Pick<ReturnType<typeof useTreeEditing<T>>,
  "nodes" | "entries" | "locked" | "edit" | "labels" | "query" | "startEdit" |
  "setDestination" | "setMoveId" | "setError" | "perform" | "setRemoveId"
> & {
  nodeId: string | null;
  Item?: typeof DropdownMenuItem | typeof ContextMenuItem;
  menuActionRef: RefObject<boolean>;
};

export function TreeEditorActionMenu<T>({
  nodeId,
  Item = DropdownMenuItem,
  nodes,
  entries,
  locked,
  edit,
  labels,
  query,
  startEdit,
  setDestination,
  setMoveId,
  setError,
  perform,
  setRemoveId,
  menuActionRef,
}: ActionMenuProps<T>) {
  const entry = nodeId ? entries.get(nodeId) : undefined;
  const blocked = locked || !!edit || !entry || entry.disabled;

  function begin(action: () => void) {
    if (blocked) {
      return;
    }

    menuActionRef.current = true;
    action();
  }

  return (
    <TreeEditorActionItems
      Item={Item}
      labels={labels}
      blocked={blocked}
      filtering={!!query.trim()}
      first={entry?.index === 0}
      last={!entry || isLastSibling(nodes, entries, entry)}
      onAddBeside={(position) => {
        begin(() => {
          startEdit({
            type: "create",
            parentId: entry!.parentId,
            label: "",
            anchor: { id: entry!.node.id, position },
          });
        });
      }}
      onRename={() => {
        begin(() => {
          startEdit({
            type: "rename",
            id: entry!.node.id,
            label: entry!.node.label,
          });
        });
      }}
      onMove={() => {
        begin(() => {
          setDestination(null);
          setMoveId(nodeId);
          setError("");
        });
      }}
      onShift={(offset) => {
        if (!blocked && entry) {
          perform({
            type: "move",
            id: entry.node.id,
            parentId: entry.parentId,
            index: entry.index + offset,
          });
        }
      }}
      onRemove={() => {
        begin(() => {
          setRemoveId(nodeId);
          setError("");
        });
      }}
    />
  );
}
