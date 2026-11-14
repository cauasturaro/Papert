import { getTreeEntries, type TreeNode } from "./tree-model.ts";

export function getVisibleTree<T>(
  nodes: readonly TreeNode<T>[],
  expanded: ReadonlySet<string>,
  query: string,
) {
  const entries = getTreeEntries(nodes);
  const shown = new Set<string>();

  if (query) {
    for (const { node } of entries.values()) {
      if (
        !node.label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(query)
      ) {
        continue;
      }
      let current: string | null = node.id;
      while (current !== null) {
        shown.add(current);
        current = entries.get(current)!.parentId;
      }
    }
  }

  const visible: string[] = [];
  function collect(items: readonly TreeNode<T>[]) {
    for (const node of items) {
      if (query && !shown.has(node.id)) {
        continue;
      }
      visible.push(node.id);
      if (query || expanded.has(node.id)) {
        collect(node.children ?? []);
      }
    }
  }

  collect(nodes);

  return { entries, shown, visible };
}
