"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button/button";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { CloseIcon, FileIcon } from "@/components/icons";
import type { ResolvedTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { Files } from "../workspace-tree";
import { languageLabel } from "./language";

const CodeEditor = dynamic(
  () => import("./code-editor").then((module) => module.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        Loading editor…
      </p>
    ),
  },
);

export type EditorSelection = { path: string; start: number; end: number };

type EditorAreaProps = {
  workspaceId: string;
  files: Files;
  savedFiles: Files;
  tabs: string[];
  active: string | null;
  theme: ResolvedTheme;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onFilesChange: (files: Files) => void;
  onSelectionChange: (selection: EditorSelection) => void;
};

function fileName(path: string) {
  return path.split("/").pop() ?? path;
}

export function EditorArea({
  workspaceId,
  files,
  savedFiles,
  tabs,
  active,
  theme,
  onSelectTab,
  onCloseTab,
  onFilesChange,
  onSelectionChange,
}: EditorAreaProps) {
  const [plainText, setPlainText] = useState(false);
  const toggleLabel = plainText ? "Use Monaco editor" : "Use plain text editor";

  function updateActive(content: string) {
    if (!active) {
      return;
    }

    onFilesChange({ ...files, [active]: content });
  }

  return (
    <section
      aria-label="Code editor panel"
      className="flex h-full min-h-0 min-w-0 flex-col bg-card"
    >
      <div className="flex h-10 shrink-0 items-stretch border-b border-border">
        <ul
          aria-label="Open files"
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
        >
          {tabs.map((path) => (
            <EditorTab
              key={path}
              path={path}
              active={path === active}
              unsaved={files[path] !== savedFiles[path]}
              onSelect={() => onSelectTab(path)}
              onClose={() => onCloseTab(path)}
            />
          ))}
        </ul>

        <Button
          variant="ghost"
          size="sm"
          className="my-1 mr-1 shrink-0 text-xs"
          aria-pressed={plainText}
          aria-label={toggleLabel}
          onClick={() => setPlainText(!plainText)}
        >
          <span className="max-sm:hidden">{toggleLabel}</span>
          <span aria-hidden="true" className="sm:hidden">
            {plainText ? "Monaco" : "Plain text"}
          </span>
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {active && plainText && (
          <textarea
            aria-label={`Code editor: ${active}`}
            className="h-full w-full resize-none bg-card p-4 font-mono text-sm text-foreground focus-visible:outline-none"
            spellCheck={false}
            value={files[active] ?? ""}
            onChange={(event) => updateActive(event.target.value)}
            onSelect={(event) => {
              const editor = event.currentTarget;

              onSelectionChange({
                path: active,
                start: editor.selectionStart,
                end: editor.selectionEnd,
              });
            }}
          />
        )}

        {active && !plainText && (
          <CodeEditor
            key={`${workspaceId}/${active}`}
            path={`${workspaceId}/${active}`}
            value={files[active] ?? ""}
            theme={theme}
            onChange={updateActive}
            onSelectionChange={(range) =>
              onSelectionChange({ path: active, ...range })
            }
          />
        )}

        {!active && (
          <EmptyState className="h-full justify-center">
            <EmptyStateIcon>
              <FileIcon />
            </EmptyStateIcon>
            <EmptyStateTitle as="h2">No file open</EmptyStateTitle>
            <EmptyStateDescription>
              Select a file in the explorer, or create one with New. Directories
              contain files and have no editable content.
            </EmptyStateDescription>
          </EmptyState>
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-border bg-muted px-3 text-xs text-muted-foreground">
        <span>{active ? languageLabel(active) : "No file"}</span>
        <span className="truncate">
          {plainText
            ? "Tab moves focus between controls."
            : "Tab inserts indentation. Press Ctrl+M (Windows/Linux) or Ctrl+Shift+M (macOS) to let Tab move focus."}
        </span>
      </footer>
    </section>
  );
}

function EditorTab({
  path,
  active,
  unsaved,
  onSelect,
  onClose,
}: {
  path: string;
  active: boolean;
  unsaved: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  return (
    <li
      className={cn(
        "group flex shrink-0 items-center border-r border-border text-sm",
        active
          ? "bg-background text-foreground shadow-[inset_0_-2px_0_var(--ring)]"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      <button
        type="button"
        title={path}
        aria-current={active ? "true" : undefined}
        className="flex h-full items-center gap-2 pr-1 pl-3 font-mono text-xs focus-visible:outline-offset-[-2px]"
        onClick={onSelect}
      >
        <FileIcon className="size-3.5" />
        {fileName(path)}
        {unsaved && (
          <span
            aria-label="Unsaved"
            className="size-1.5 rounded-full bg-ring"
          />
        )}
      </button>

      <button
        type="button"
        aria-label={`Close ${path}`}
        className="mr-1 flex size-6 items-center justify-center rounded-sm opacity-60 hover:bg-accent hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-offset-[-2px]"
        onClick={onClose}
      >
        <CloseIcon className="size-3.5" />
      </button>
    </li>
  );
}
