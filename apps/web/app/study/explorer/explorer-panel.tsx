"use client";

import { useState } from "react";
import { TreeEditor } from "@/components/ui/tree-editor/tree-editor";
import { FileIcon, FolderIcon } from "@/components/icons";
import { treePaths, type Files } from "../workspace-tree";
import {
  applyNodeChange,
  changedPath,
  isDirectory,
  rejectionReason,
  toTreeNodes,
  type WorkspaceChange,
  type WorkspaceNode,
} from "./workspace-tree-nodes";

type ExplorerPanelProps = {
  files: Files;
  savedFiles: Files;
  activePath: string | null;
  onFilesChange: (files: Files) => void;
  onOpenFile: (path: string) => void;
  /** Called after a rename or move so open editor tabs can follow. */
  onPathMoved: (from: string, to: string) => void;
};

const labels = {
  addRoot: "New",
  addChild: "Add inside",
  actions: "More",
  name: "Name (end with / for a folder)",
  createTitle: "New file or folder",
};

// Fits TreeEditor into the narrow panel without changing the library: compact
// one-line toolbar, no echo of the selected name, borderless tree.
const explorerTreeClasses = [
  "[&>[role=group]]:flex-nowrap [&>[role=group]]:gap-1",
  "[&>[role=group]_button]:h-7 [&>[role=group]_button]:px-2 [&>[role=group]_button]:text-xs",
  "[&>[role=group]>span:last-child:not([data-slot])]:hidden",
  "[&_[data-slot=tree]]:border-0 [&_[data-slot=tree]]:bg-transparent [&_[data-slot=tree]]:p-0",
  // Inline create/rename row: full-width name field, compact actions below.
  "[&_div:has(>[data-slot=input]+button)]:gap-1",
  "[&_div:has(>[data-slot=input]+button)>[data-slot=input]]:h-7 [&_div:has(>[data-slot=input]+button)>[data-slot=input]]:min-w-0 [&_div:has(>[data-slot=input]+button)>[data-slot=input]]:basis-full [&_div:has(>[data-slot=input]+button)>[data-slot=input]]:px-2 [&_div:has(>[data-slot=input]+button)>[data-slot=input]]:text-xs",
  "[&_div:has(>[data-slot=input]+button)>button]:h-6 [&_div:has(>[data-slot=input]+button)>button]:px-2 [&_div:has(>[data-slot=input]+button)>button]:text-xs",
].join(" ");

function parentDirectories(path: string) {
  const parts = path.replace(/\/$/, "").split("/");

  return parts
    .slice(0, -1)
    .map((_, index) => `${parts.slice(0, index + 1).join("/")}/`);
}

export function ExplorerPanel({
  files,
  savedFiles,
  activePath,
  onFilesChange,
  onOpenFile,
  onPathMoved,
}: ExplorerPanelProps) {
  // Files follow the active editor tab; a selected directory is local state.
  const [selectedDirectory, setSelectedDirectory] = useState<string | null>(
    null,
  );
  const [expandedIds, setExpandedIds] = useState<string[]>(() =>
    Object.keys(files).flatMap(parentDirectories),
  );

  const nodes = toTreeNodes(files);
  const selectedId =
    selectedDirectory && treePaths(files).includes(selectedDirectory)
      ? selectedDirectory
      : activePath;

  function select(id: string | null) {
    if (id && !isDirectory(id)) {
      setSelectedDirectory(null);
      onOpenFile(id);

      return;
    }

    setSelectedDirectory(id);
  }

  function change(_: unknown, treeChange: WorkspaceChange) {
    const updated = applyNodeChange(files, treeChange);
    const destination = changedPath(treeChange);

    onFilesChange(updated);

    if (destination && treeChange.type !== "create") {
      onPathMoved(treeChange.id, destination);
    }

    if (destination) {
      setExpandedIds((current) => [
        ...new Set([...current, ...parentDirectories(destination)]),
      ]);
      select(destination);
    }
  }

  return (
    <section
      aria-label="Files"
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <header className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Explorer
        </h2>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <TreeEditor<{ kind: "file" | "directory" }>
          size="sm"
          className={explorerTreeClasses}
          label="Workspace files"
          searchLabel="Search files"
          emptyMessage="No files yet. Use New to create your first file."
          labels={labels}
          value={nodes}
          onChange={change}
          canChange={(treeChange) => rejectionReason(files, treeChange)}
          createNode={(label) => ({ id: `new:${label}`, label })}
          selectedId={selectedId}
          onSelectedChange={select}
          expandedIds={expandedIds}
          onExpandedChange={setExpandedIds}
          showNodeActions
          enableContextMenu
          renderIcon={(node: WorkspaceNode) => (
            <EntryIcon
              node={node}
              unsaved={files[node.id] !== savedFiles[node.id]}
            />
          )}
        />
      </div>

      <p className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        20 entries · 16k characters per file · 64 KB total
      </p>
    </section>
  );
}

function EntryIcon({
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
      {unsaved && (
        <span
          aria-label="Unsaved"
          className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-ring"
        />
      )}
    </span>
  );
}
