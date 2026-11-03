export type TreeNode<T = unknown> = {
  id: string;
  label: string;
  children?: readonly TreeNode<T>[];
  disabled?: boolean;
  data?: T;
};
export type TreeEntry<T = unknown> = {
  node: TreeNode<T>;
  parentId: string | null;
  index: number;
  depth: number;
  disabled: boolean;
};
export type TreeChange<T = unknown> =
  | {
      type: "create";
      parentId: string | null;
      index: number;
      node: TreeNode<T>;
    }
  | { type: "rename"; id: string; label: string }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; parentId: string | null; index: number };

export function validateTree<T>(nodes: readonly TreeNode<T>[]): string | null {
  const ids = new Set<string>();
  const ancestors = new Set<TreeNode<T>>();
  function visit(items: readonly TreeNode<T>[]): string | null {
    if (!Array.isArray(items)) return "The node list must be an array.";
    for (const node of items) {
      if (!node || typeof node !== "object") return "Invalid node.";
      if (ancestors.has(node)) return "The tree contains a cycle.";
      if (typeof node.id !== "string" || !node.id.trim() || ids.has(node.id))
        return "Each node needs a unique, non-empty ID.";
      if (typeof node.label !== "string" || !node.label.trim())
        return "Each node needs a non-empty name.";
      ids.add(node.id);
      ancestors.add(node);
      const error = node.children === undefined ? null : visit(node.children);
      if (error) return error;
      ancestors.delete(node);
    }
    return null;
  }
  return visit(nodes);
}

export function getTreeEntries<T>(nodes: readonly TreeNode<T>[]) {
  const error = validateTree(nodes);
  if (error) throw new Error(error);
  const entries = new Map<string, TreeEntry<T>>();
  function visit(
    items: readonly TreeNode<T>[],
    parentId: string | null,
    depth: number,
    disabled: boolean,
  ) {
    items.forEach((node, index) => {
      const locked = disabled || !!node.disabled;
      entries.set(node.id, { node, parentId, index, depth, disabled: locked });
      visit(node.children ?? [], node.id, depth + 1, locked);
    });
  }
  visit(nodes, null, 1, false);
  return entries;
}

export type TreeCheckState = { checked: boolean; mixed: boolean };
export function getTreeCheckStates<T>(
  nodes: readonly TreeNode<T>[],
  selectedIds: readonly string[],
) {
  const selected = new Set(selectedIds);
  const states = new Map<string, TreeCheckState>();
  function visit(items: readonly TreeNode<T>[], disabled: boolean) {
    for (const node of items) {
      const locked = disabled || !!node.disabled;
      visit(node.children ?? [], locked);
      const children = (node.children ?? []).filter((child) => !child.disabled);
      const checked =
        !locked &&
        (children.length
          ? children.every((child) => states.get(child.id)?.checked)
          : selected.has(node.id));
      const mixed =
        !locked &&
        !checked &&
        children.some((child) => {
          const state = states.get(child.id);
          return state?.checked || state?.mixed;
        });
      states.set(node.id, { checked: !!checked, mixed });
    }
  }
  visit(nodes, false);
  return states;
}

// The target index refers to the list after the node leaves its source.
export function applyTreeChange<T>(
  nodes: readonly TreeNode<T>[],
  change: TreeChange<T>,
): readonly TreeNode<T>[] {
  const entries = getTreeEntries(nodes);
  const source = "id" in change ? entries.get(change.id) : undefined;
  if ("id" in change && !source) throw new Error("The node no longer exists.");
  if (source?.disabled) throw new Error("This node is disabled.");
  if (source && (change.type === "move" || change.type === "remove")) {
    if (
      [...getTreeEntries([source.node]).values()].some(
        (entry) => entry.disabled,
      )
    )
      throw new Error("The subtree contains disabled nodes.");
  }
  if (change.type === "create" || change.type === "move") {
    const parent =
      change.parentId === null ? undefined : entries.get(change.parentId);
    if (change.parentId !== null && !parent)
      throw new Error("The destination no longer exists.");
    if (parent?.disabled) throw new Error("The destination is disabled.");
    if (change.type === "move" && source) {
      const subtree = getTreeEntries([source.node]);
      if (change.parentId !== null && subtree.has(change.parentId))
        throw new Error("A node cannot move inside its own subtree.");
    }
    const length =
      (parent ? (parent.node.children?.length ?? 0) : nodes.length) -
      (source?.parentId === change.parentId ? 1 : 0);
    if (
      !Number.isInteger(change.index) ||
      change.index < 0 ||
      change.index > length
    )
      throw new Error("Invalid destination position.");
  }
  if (change.type === "rename" && !change.label.trim())
    throw new Error("Enter a name.");
  function update(
    items: readonly TreeNode<T>[],
    parentId: string | null,
  ): readonly TreeNode<T>[] {
    let changed = false;
    const next: TreeNode<T>[] = [];
    for (const node of items) {
      if (
        (change.type === "remove" || change.type === "move") &&
        node.id === change.id
      ) {
        changed = true;
        continue;
      }
      let value = node;
      if (change.type === "rename" && node.id === change.id) {
        value = { ...node, label: change.label.trim() };
      } else if (
        node.children ||
        ((change.type === "create" || change.type === "move") &&
          change.parentId === node.id)
      ) {
        const children = update(node.children ?? [], node.id);
        if (children !== node.children) value = { ...node, children };
      }
      changed ||= value !== node;
      next.push(value);
    }
    if (
      (change.type === "create" || change.type === "move") &&
      change.parentId === parentId
    ) {
      next.splice(
        change.index,
        0,
        change.type === "create" ? change.node : source!.node,
      );
      changed = true;
    }
    return changed ? next : items;
  }
  const next = update(nodes, null);
  const error = validateTree(next);
  if (error) throw new Error(error);
  return next;
}
