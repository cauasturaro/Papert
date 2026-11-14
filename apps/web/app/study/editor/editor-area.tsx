"use client";

import dynamic from "next/dynamic";
import { memo } from "react";
import { Button } from "@/components/ui/button/button";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { FileIcon } from "@/components/icons";
import type { ResolvedTheme } from "@/lib/theme";
import type { Files } from "../workspace/workspace-tree";
import { useMediaQuery } from "../use-browser-session";
import type { CodeRange } from "./code-editor";
import type { EditorController } from "./editor-controller";
import { type EditorSettings } from "./editor-settings";
import { languageLabel } from "./language";
import { EditorSettingsMenu } from "./editor-settings-menu";
import { EditorTab } from "./editor-tab";
import { tabTitles } from "./editor-tab-titles";
import { CursorStatus } from "./cursor-status";
import { PlainTextEditor } from "./plain-text-editor";

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

export type { CodeRange };

/** Id of the editor region; the skip link and shortcuts move focus here. */
export const EDITOR_REGION_ID = "study-editor";

type EditorAreaProps = {
  workspaceId: string;
  files: Files;
  savedFiles: Files;
  tabs: string[];
  active: string | null;
  theme: ResolvedTheme;
  controller: EditorController;
  settings: EditorSettings;
  onSettingsChange: (change: Partial<EditorSettings>) => void;
  focusMode: boolean;
  onToggleFocusMode: () => void;
  onShowShortcuts: () => void;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onFileChange: (path: string, content: string) => void;
  onSelectionChange: (path: string, range: CodeRange | null) => void;
  onAskSeymour: (path: string, range: CodeRange | null) => void;
  onSave: () => void;
};

export const EditorArea = memo(function EditorArea({
  workspaceId,
  files,
  savedFiles,
  tabs,
  active,
  theme,
  controller,
  settings,
  onSettingsChange,
  focusMode,
  onToggleFocusMode,
  onShowShortcuts,
  onSelectTab,
  onCloseTab,
  onFileChange,
  onSelectionChange,
  onAskSeymour,
  onSave,
}: EditorAreaProps) {
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  const titles = tabTitles(tabs);
  const plainText = settings.plainText;

  return (
    <section
      id={EDITOR_REGION_ID}
      tabIndex={-1}
      aria-label="Code editor panel"
      className="flex h-full min-h-0 min-w-0 flex-col bg-card focus-visible:outline-none"
    >
      <div className="flex h-10 shrink-0 items-stretch border-b border-border">
        <ul
          aria-label="Open files"
          className="flex min-w-0 flex-1 items-stretch overflow-x-auto"
        >
          {tabs.map((path, index) => (
            <EditorTab
              key={path}
              path={path}
              name={titles.get(path)?.name ?? path}
              folder={titles.get(path)?.folder ?? null}
              position={index + 1}
              active={path === active}
              unsaved={files[path] !== savedFiles[path]}
              onSelect={() => onSelectTab(path)}
              onClose={() => onCloseTab(path)}
            />
          ))}
        </ul>

        {coarsePointer && (
          <Button
            variant="ghost"
            size="sm"
            className="my-1 shrink-0 text-xs"
            aria-pressed={plainText}
            onClick={() => onSettingsChange({ plainText: !plainText })}
          >
            Plain text
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="my-1 shrink-0 text-xs max-lg:hidden"
          aria-pressed={focusMode}
          onClick={onToggleFocusMode}
        >
          Focus editor
        </Button>

        <div className="mr-1 flex">
          <EditorSettingsMenu
            settings={settings}
            onSettingsChange={onSettingsChange}
            onShowShortcuts={onShowShortcuts}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {active && plainText && (
          <PlainTextEditor
            path={active}
            value={files[active] ?? ""}
            controller={controller}
            onFileChange={onFileChange}
            onSelectionChange={onSelectionChange}
          />
        )}

        {active && !plainText && (
          <CodeEditor
            workspaceId={workspaceId}
            path={active}
            files={files}
            theme={theme}
            settings={settings}
            controller={controller}
            onChange={onFileChange}
            onSelectionChange={onSelectionChange}
            onAskSeymour={onAskSeymour}
            onSave={onSave}
            onUsePlainText={() => onSettingsChange({ plainText: true })}
          />
        )}

        {!active && (
          <EmptyState className="h-full justify-center">
            <EmptyStateIcon>
              <FileIcon />
            </EmptyStateIcon>
            <EmptyStateTitle as="h2">No file open</EmptyStateTitle>
            <EmptyStateDescription>
              Select a file in the explorer, or create one with New. Folders
              hold files and have no text of their own.
            </EmptyStateDescription>
          </EmptyState>
        )}
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-4 overflow-hidden border-t border-border bg-muted px-3 text-xs text-muted-foreground">
        <span className="shrink-0">
          {active ? languageLabel(active) : "No file"}
        </span>

        <CursorStatus controller={controller} />

        <span className="truncate max-md:hidden">
          {plainText
            ? "Tab moves focus between controls."
            : "Tab indents. Ctrl+M (Windows/Linux) or Ctrl+Shift+M (macOS) lets Tab move focus."}
        </span>
      </footer>
    </section>
  );
});
