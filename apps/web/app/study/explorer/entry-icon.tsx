import { FileIcon, FolderIcon } from "@/components/icons";
import type { WorkspaceNode } from "./workspace-tree-nodes";

export function EntryIcon({
  node,
  unsaved,
}: {
  node: WorkspaceNode;
  unsaved: boolean;
}) {
  const Icon = node.data?.kind === "directory" ? FolderIcon : FileIcon;

  return (
    <span className="relative inline-flex">
      <Icon className="size-4 text-muted-foreground" />
      {/* The row's accessible name says "unsaved"; this dot is visual only. */}
      {unsaved && (
        <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-ring" />
      )}
    </span>
  );
}
