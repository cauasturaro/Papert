"use client";

import { memo, useEffect, useState } from "react";
import { Button } from "@/components/ui/button/button";
import { TreeEditor } from "@/components/ui/tree-editor/tree-editor";
import { EntryIcon } from "./entry-icon";
import { announce } from "@/lib/a11y/announcer";
import {
  treePaths,
  restoreEntries,
  MAX_ENTRIES,
  MAX_BYTES,
  MAX_FILE_CHARACTERS,
  type Files,
} from "../workspace/workspace-tree";
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

const UNDO_VISIBLE_MS = 15_000;

type Removal = { label: string; entries: Files };

function workspaceBytes(files: Files) {
  return new TextEncoder().encode(JSON.stringify(files)).length;
}

function kilobytes(bytes: number) {
  return (bytes / 1000).toLocaleString(undefined, {
    maximumFractionDigits: 1,
  });
}

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
  "[&>[data-slot=tree-editor-toolbar]]:flex-nowrap [&>[data-slot=tree-editor-toolbar]]:gap-1",
  "[&>[data-slot=tree-editor-toolbar]_button]:h-7 [&>[data-slot=tree-editor-toolbar]_button]:px-2 [&>[data-slot=tree-editor-toolbar]_button]:text-xs",
  "[&_[data-slot=tree-editor-selected-label]]:hidden",
  "[&_[data-slot=tree]]:border-0 [&_[data-slot=tree]]:bg-transparent [&_[data-slot=tree]]:p-0",
  // Inline create/rename row: full-width name field, compact actions below.
  "[&_[data-slot=tree-editor-name-input]]:gap-1",
  "[&_[data-slot=tree-editor-name-input]>[data-slot=input]]:h-7 [&_[data-slot=tree-editor-name-input]>[data-slot=input]]:min-w-0 [&_[data-slot=tree-editor-name-input]>[data-slot=input]]:basis-full [&_[data-slot=tree-editor-name-input]>[data-slot=input]]:px-2 [&_[data-slot=tree-editor-name-input]>[data-slot=input]]:text-xs",
  "[&_[data-slot=tree-editor-name-input]>button]:h-6 [&_[data-slot=tree-editor-name-input]>button]:px-2 [&_[data-slot=tree-editor-name-input]>button]:text-xs",
].join(" ");

function parentDirectories(path: string) {
  const parts = path.replace(/\/$/, "").split("/");

  return parts
    .slice(0, -1)
    .map((_, index) => `${parts.slice(0, index + 1).join("/")}/`);
}

export const ExplorerPanel = memo(function ExplorerPanel({
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

  const [removal, setRemoval] = useState<Removal | null>(null);
  const [undoError, setUndoError] = useState("");

  useEffect(() => {
    if (!removal) {
      return;
    }

    const timer = window.setTimeout(() => setRemoval(null), UNDO_VISIBLE_MS);

    return () => window.clearTimeout(timer);
  }, [removal]);

  const nodes = toTreeNodes(files);
  const entryCount = Object.keys(files).length;
  const bytes = workspaceBytes(files);
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

  function rememberRemoval(updated: Files, id: string) {
    const entries = Object.fromEntries(
      Object.entries(files).filter(([path]) => !Object.hasOwn(updated, path)),
    );
    const label = id.replace(/\/$/, "").split("/").pop() ?? id;

    setUndoError("");
    setRemoval({ label, entries });
  }

  function undoRemoval() {
    if (!removal) {
      return;
    }

    let restored: Files;

    try {
      restored = restoreEntries(files, removal.entries);
    } catch (error) {
      setUndoError(
        error instanceof Error ? error.message : "The file cannot be restored.",
      );
      return;
    }

    onFilesChange(restored);
    setRemoval(null);
    announce(`Restored ${removal.label}.`);
  }

  function change(_: unknown, treeChange: WorkspaceChange) {
    const updated = applyNodeChange(files, treeChange);
    const destination = changedPath(treeChange);

    onFilesChange(updated);

    if (treeChange.type === "remove") {
      rememberRemoval(updated, treeChange.id);
    }

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
          getItemLabel={(node: WorkspaceNode) =>
            files[node.id] !== savedFiles[node.id]
              ? `${node.label}, unsaved`
              : node.label
          }
          renderIcon={(node: WorkspaceNode) => (
            <EntryIcon
              node={node}
              unsaved={files[node.id] !== savedFiles[node.id]}
            />
          )}
        />
      </div>

      {removal && (
        <div
          role="status"
          className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border bg-muted px-3 py-1.5 text-xs"
        >
          <span className="min-w-0 flex-1 truncate">
            Deleted <span className="font-mono">{removal.label}</span>
          </span>

          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-xs"
            onClick={undoRemoval}
          >
            Undo
          </Button>

          {undoError && (
            <p role="alert" className="basis-full text-destructive">
              {undoError}
            </p>
          )}
        </div>
      )}

      <p
        className="shrink-0 border-t border-border px-3 py-2 text-xs text-muted-foreground"
        title={`Up to ${MAX_ENTRIES} files and folders, ${MAX_FILE_CHARACTERS.toLocaleString("en-US")} characters per file and ${kilobytes(MAX_BYTES)} KB in total.`}
      >
        {entryCount} of {MAX_ENTRIES} entries · {kilobytes(bytes)} of{" "}
        {kilobytes(MAX_BYTES)} KB
      </p>
    </section>
  );
});
