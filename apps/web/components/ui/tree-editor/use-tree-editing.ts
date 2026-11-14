"use client";

import { useId, useRef, useState } from "react";
import {
  applyTreeChange,
  getTreeEntries,
  type TreeNode,
  type TreeChange,
} from "../tree/tree-model";
import { defaultLabels } from "./tree-editor-labels";
import {
  creationPosition,
  moveChange,
  selectionAfterRemove,
  type CreateEdit,
  type DropPosition,
  type Edit,
} from "./tree-editor-positions";
import type { TreeEditorProps } from "./tree-editor";

export function useTreeEditing<T>({
  value,
  defaultValue = [],
  onChange,
  canChange,
  createNode,
  onChangeRejected,
  selectedId,
  defaultSelectedId = null,
  onSelectedChange,
  expandedIds,
  defaultExpandedIds = [],
  onExpandedChange,
  disabled = false,
  readOnly = false,
  pending = false,
  labels: labelOverrides,
}: TreeEditorProps<T>) {
  const id = useId();
  const [localNodes, setNodes] = useState(defaultValue);
  const [localSelected, setSelected] = useState<string | null>(
    defaultSelectedId,
  );
  const [localExpanded, setExpanded] =
    useState<readonly string[]>(defaultExpandedIds);
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const treeRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const menuActionRef = useRef(false);
  const nodes = value ?? localNodes;
  const entries = getTreeEntries(nodes);
  const selected = selectedId === undefined ? localSelected : selectedId;
  const current = selected ? entries.get(selected) : undefined;
  const labels = { ...defaultLabels, ...labelOverrides };
  const locked = disabled || readOnly || pending;
  const expanded = expandedIds ?? localExpanded;
  const removeNode = removeId ? entries.get(removeId)?.node : undefined;
  function choose(next: string | null) {
    if (selectedId === undefined) {
      setSelected(next);
    }
    onSelectedChange?.(next);
  }

  function expand(next: string[]) {
    if (expandedIds === undefined) {
      setExpanded(next);
    }
    onExpandedChange?.(next);
  }

  function reveal(parentId: string | null) {
    const next = new Set(expanded);
    let key = parentId;
    while (key !== null) {
      next.add(key);
      key = entries.get(key)?.parentId ?? null;
    }
    if (next.size !== expanded.length) {
      expand([...next]);
    }
  }

  function focusNode(key?: string | null) {
    requestAnimationFrame(() => {
      // A consumer that derives ids from names re-keys a renamed item, so the selection is the fallback.
      const target =
        [
          ...(treeRef.current?.querySelectorAll<HTMLElement>(
            "[data-tree-id]",
          ) ?? []),
        ].find((element) => element.dataset.treeId === key) ??
        treeRef.current?.querySelector<HTMLElement>(
          '[role="treeitem"][aria-selected="true"]',
        ) ??
        treeRef.current?.querySelector<HTMLElement>(
          '[role="treeitem"][tabindex="0"]',
        ) ??
        treeRef.current?.querySelector<HTMLElement>("input");
      (target ?? addButtonRef.current)?.focus();
    });
  }

  function reject(reason: string) {
    setError(reason);
    onChangeRejected?.(reason);
  }

  function perform(change: TreeChange<T>): boolean {
    if (locked) {
      return false;
    }
    let next: readonly TreeNode<T>[];
    try {
      next = applyTreeChange(nodes, change);
      const reason = canChange?.(change, nodes);
      if (reason) {
        reject(reason);
        return false;
      }
    } catch (cause) {
      reject(
        cause instanceof Error ? cause.message : "Unable to change the tree.",
      );
      return false;
    }
    if (value === undefined) {
      setNodes(next);
    }
    onChange?.(next, change);
    setError("");
    const messages = {
      create: labels.added,
      rename: labels.renamed,
      remove: labels.removed,
      move: labels.moved,
    };
    setMessage(messages[change.type]);

    if (change.type === "create") {
      setQuery("");
      reveal(change.parentId);
      choose(change.node.id);
      focusNode(change.node.id);
    } else if (change.type === "remove") {
      const nextId = selectionAfterRemove(nodes, entries, change.id);
      choose(nextId);
      focusNode(nextId);
      const surviving = getTreeEntries(next);
      expand(expanded.filter((key) => surviving.has(key)));
    } else {
      if (change.type === "rename") {
        setQuery("");
      }
      reveal(
        change.type === "move"
          ? change.parentId
          : entries.get(change.id)!.parentId,
      );
      choose(change.id);
      focusNode(change.id);
    }
    return true;
  }

  function createPosition(draft: CreateEdit) {
    return creationPosition(nodes, entries, draft);
  }

  function saveEdit() {
    if (!edit || locked) {
      return;
    }
    if (!edit.label.trim()) {
      reject(labels.requiredName);
      return;
    }
    if (edit.type === "rename") {
      if (perform({ type: "rename", id: edit.id, label: edit.label })) {
        setEdit(null);
      }
    } else {
      let change: TreeChange<T>;
      try {
        const position = createPosition(edit);
        const node = createNode
          ? createNode(edit.label.trim())
          : { id: crypto.randomUUID(), label: edit.label.trim() };
        change = { type: "create", ...position, node };
      } catch (cause) {
        reject(
          cause instanceof Error ? cause.message : "Unable to create the item.",
        );
        return;
      }
      if (perform(change)) {
        setEdit(null);
      }
    }
  }

  function startEdit(next: Edit) {
    setError("");
    if (next.type === "create") {
      setQuery("");
      reveal(next.parentId);
    }
    setEdit(next);
  }

  function cancelEdit() {
    setEdit(null);
    setError("");
    focusNode(selected);
  }

  function move(
    sourceId: string,
    targetId: string | null,
    position: DropPosition,
  ) {
    const change = moveChange(nodes, entries, sourceId, targetId, position);

    if (!change) {
      reject("The item or destination no longer exists.");
      return false;
    }

    return perform(change);
  }

  return {
    id,
    nodes,
    entries,
    selected,
    current,
    labels,
    locked,
    expanded,
    removeNode,
    query,
    setQuery,
    edit,
    setEdit,
    removeId,
    setRemoveId,
    moveId,
    setMoveId,
    destination,
    setDestination,
    message,
    error,
    setError,
    treeRef,
    addButtonRef,
    menuActionRef,
    choose,
    expand,
    focusNode,
    reject,
    perform,
    createPosition,
    saveEdit,
    startEdit,
    cancelEdit,
    move,
  };
}
