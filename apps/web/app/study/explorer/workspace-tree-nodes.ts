import type {
  TreeChange,
  TreeNode,
} from "../../../components/ui/tree/tree-model";
import {
  createEntry,
  removeEntry,
  renameEntry,
  treePaths,
  type Files,
} from "../workspace/workspace-tree.ts";

/**
 * Adapter between the flat `Files` record (path → content, directories end in
 * "/") and TreeEditor nodes. Node IDs are workspace paths, so every structural
 * rule stays in `workspace-tree.ts`.
 */
export type EntryKind = "file" | "directory";
export type WorkspaceNode = TreeNode<{ kind: EntryKind }>;
export type WorkspaceChange = TreeChange<{ kind: EntryKind }>;

export function isDirectory(path: string) {
  return path.endsWith("/");
}

function baseName(path: string) {
  const parts = path.replace(/\/$/, "").split("/");

  return parts[parts.length - 1];
}

function parentPath(path: string) {
  const parts = path.replace(/\/$/, "").split("/");

  return parts.length === 1 ? null : `${parts.slice(0, -1).join("/")}/`;
}

export function toTreeNodes(files: Files): WorkspaceNode[] {
  const roots: WorkspaceNode[] = [];
  const children = new Map<string, WorkspaceNode[]>();

  // treePaths is sorted, so parents are always visited before their children.
  for (const path of treePaths(files)) {
    const kind: EntryKind = isDirectory(path) ? "directory" : "file";
    const node: WorkspaceNode = {
      id: path,
      label: baseName(path),
      data: { kind },
    };

    if (kind === "directory") {
      const list: WorkspaceNode[] = [];

      children.set(path, list);
      node.children = list;
    }

    const parent = parentPath(path);
    const siblings = parent ? children.get(parent) : roots;
    siblings?.push(node);
  }

  return sortNodes(roots);
}

// Directories first, then files, each alphabetically, like most editors.
function sortNodes(nodes: WorkspaceNode[]): WorkspaceNode[] {
  return nodes
    .map((node) =>
      node.children
        ? { ...node, children: sortNodes([...node.children]) }
        : node,
    )
    .sort((left, right) => {
      const leftDirectory = left.data?.kind === "directory";
      const rightDirectory = right.data?.kind === "directory";

      if (leftDirectory !== rightDirectory) {
        return leftDirectory ? -1 : 1;
      }

      return left.label.localeCompare(right.label);
    });
}

function childPath(parentId: string | null, label: string) {
  const prefix = parentId ?? "";

  return `${prefix}${label.trim()}`;
}

function ensureDirectoryParent(parentId: string | null) {
  if (parentId !== null && !isDirectory(parentId)) {
    throw new Error("Files cannot contain other entries.");
  }
}

/** Applies a TreeEditor change to the files. Throws on invalid changes. */
export function applyNodeChange(files: Files, change: WorkspaceChange): Files {
  if (change.type === "create") {
    ensureDirectoryParent(change.parentId);

    // A trailing slash in the typed name creates a directory.
    return createEntry(files, childPath(change.parentId, change.node.label));
  }

  if (change.type === "rename") {
    const destination = childPath(parentPath(change.id), change.label);

    return renameEntry(files, change.id, destination);
  }

  if (change.type === "remove") {
    return removeEntry(files, change.id);
  }

  ensureDirectoryParent(change.parentId);

  if (change.parentId === parentPath(change.id)) {
    throw new Error("Files are sorted by name. Rename an entry to reorder it.");
  }

  return renameEntry(
    files,
    change.id,
    childPath(change.parentId, baseName(change.id)),
  );
}

/** The path that holds a changed entry afterwards, for selection updates. */
export function changedPath(change: WorkspaceChange): string | null {
  if (change.type === "remove") {
    return null;
  }

  if (change.type === "create") {
    return childPath(change.parentId, change.node.label);
  }

  const directory = isDirectory(change.id);
  const label = change.type === "rename" ? change.label : baseName(change.id);
  const parent =
    change.type === "rename" ? parentPath(change.id) : change.parentId;
  const path = childPath(parent, label).replace(/\/$/, "");

  return directory ? `${path}/` : path;
}

/** TreeEditor `canChange`: returns the validation message or undefined. */
export function rejectionReason(
  files: Files,
  change: WorkspaceChange,
): string | undefined {
  try {
    applyNodeChange(files, change);

    return undefined;
  } catch (failure) {
    return failure instanceof Error
      ? failure.message
      : "Unable to change the tree.";
  }
}
