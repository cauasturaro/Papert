import type { TreeChange, TreeEntry, TreeNode } from "../tree/tree-model";

export type DropPosition = "before" | "inside" | "after";

export type CreateEdit = {
  type: "create";
  parentId: string | null;
  label: string;
  anchor?: { id: string; position: "before" | "after" };
};

export type Edit = { type: "rename"; id: string; label: string } | CreateEdit;

type Entries<T> = ReadonlyMap<string, TreeEntry<T>>;

function childrenOf<T>(
  nodes: readonly TreeNode<T>[],
  entries: Entries<T>,
  parentId: string | null,
) {
  if (parentId === null) {
    return nodes;
  }

  return entries.get(parentId)?.node.children ?? [];
}

/** Where a new item goes: beside its anchor, or last inside its parent. Throws when the anchor is gone or disabled. */
export function creationPosition<T>(
  nodes: readonly TreeNode<T>[],
  entries: Entries<T>,
  draft: CreateEdit,
) {
  const anchor = draft.anchor ? entries.get(draft.anchor.id) : undefined;

  if (draft.anchor && !anchor) {
    throw new Error("The reference item no longer exists.");
  }

  if (anchor?.disabled) {
    throw new Error("The reference item is disabled.");
  }

  const parentId = anchor ? anchor.parentId : draft.parentId;
  const siblings = childrenOf(nodes, entries, parentId);
  const offset = draft.anchor?.position === "after" ? 1 : 0;
  const index = anchor ? anchor.index + offset : siblings.length;

  return { parentId, index };
}

/**
 * The move change for dropping `sourceId` relative to `targetId` (null for the root), or
 * null when either no longer exists. The index accounts for the source leaving its place.
 */
export function moveChange<T>(
  nodes: readonly TreeNode<T>[],
  entries: Entries<T>,
  sourceId: string,
  targetId: string | null,
  position: DropPosition,
): Extract<TreeChange<T>, { type: "move" }> | null {
  const source = entries.get(sourceId);
  const target = targetId ? entries.get(targetId) : undefined;

  if (!source || (targetId !== null && !target)) {
    return null;
  }

  let parentId: string | null = null;

  if (target) {
    parentId = position === "inside" ? target.node.id : target.parentId;
  }

  const siblings = childrenOf(nodes, entries, parentId);
  const beside = target && position !== "inside";
  let index = beside
    ? target.index + (position === "after" ? 1 : 0)
    : siblings.length;

  if (source.parentId === parentId && source.index < index) {
    index -= 1;
  }

  return { type: "move", id: sourceId, parentId, index };
}

/** The item selected after deleting `id`: its next sibling, else the previous one, else its parent. */
export function selectionAfterRemove<T>(
  nodes: readonly TreeNode<T>[],
  entries: Entries<T>,
  id: string,
) {
  const entry = entries.get(id)!;
  const siblings = childrenOf(nodes, entries, entry.parentId);

  return (
    siblings[entry.index + 1]?.id ??
    siblings[entry.index - 1]?.id ??
    entry.parentId ??
    null
  );
}

/** Whether the item is already last among its siblings. */
export function isLastSibling<T>(
  nodes: readonly TreeNode<T>[],
  entries: Entries<T>,
  entry: TreeEntry<T>,
) {
  return entry.index >= childrenOf(nodes, entries, entry.parentId).length - 1;
}
