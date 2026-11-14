"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button/button";
import type { ResolvedTheme } from "@/lib/theme";
import type { Files } from "../workspace/workspace-tree";
import { useMediaQuery } from "../use-browser-session";
import type { EditorController } from "./editor-controller";
import type { EditorSettings } from "./editor-settings";
import { languageFor } from "./language";
import { monacoThemeName } from "./monaco-themes";
import "../../../public/monaco/editor.css";
import { modelUri } from "./editor-models";
import { useMonacoLoader } from "./use-monaco-loader";
import { useWorkspaceLanguageServices } from "./use-workspace-language-services";
import { registerEditorEvents } from "./register-editor-events";
import { useStableCallback } from "../use-stable-callback";

declare global {
  interface Window {
    papertMonaco?: typeof Monaco;
    MonacoEnvironment?: Monaco.Environment;
  }
}

/** A non-empty selection in the active file: character offsets and 1-based lines. */
export type CodeRange = {
  start: number;
  end: number;
  startLine: number;
  endLine: number;
};

type CodeEditorProps = {
  workspaceId: string;
  path: string;
  files: Files;
  theme: ResolvedTheme;
  settings: EditorSettings;
  controller: EditorController;
  onChange: (path: string, value: string) => void;
  onSelectionChange: (path: string, range: CodeRange | null) => void;
  onAskSeymour: (path: string, range: CodeRange | null) => void;
  onSave: () => void;
  onUsePlainText: () => void;
};

export function CodeEditor({
  workspaceId,
  path,
  files,
  theme,
  settings,
  controller,
  onChange,
  onSelectionChange,
  onAskSeymour,
  onSave,
  onUsePlainText,
}: CodeEditorProps) {
  const { ready, error, retry } = useMonacoLoader();
  const [mounted, setMounted] = useState(false);
  const disposeEvents = useRef<(() => void) | null>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");

  useWorkspaceLanguageServices(ready, workspaceId, files, path);

  const handleChange = useStableCallback((content: string | undefined) => {
    onChange(path, content ?? "");
  });
  const selectionChanged = useStableCallback((range: CodeRange | null) => {
    onSelectionChange(path, range);
  });
  const askSeymour = useStableCallback((range: CodeRange | null) => {
    onAskSeymour(path, range);
  });
  const save = useStableCallback(onSave);

  useEffect(() => {
    if (mounted) {
      controller.pathShown(path);
    }
  }, [mounted, path, controller]);

  useEffect(() => {
    return () => {
      disposeEvents.current?.();
      controller.pathShown(null);
    };
  }, [controller]);

  function handleMount(
    editor: Monaco.editor.IStandaloneCodeEditor,
    monaco: typeof Monaco,
  ) {
    disposeEvents.current?.();
    disposeEvents.current = registerEditorEvents(editor, monaco, controller, {
      onSelectionChange: selectionChanged,
      onAskSeymour: askSeymour,
      onSave: save,
    });

    setMounted(true);
  }

  // A new options object makes the editor reapply every option, so it changes only with settings.
  const options = useMemo<Monaco.editor.IStandaloneEditorConstructionOptions>(
    () => ({
      ariaLabel: `Code editor: ${path}`,
      minimap: { enabled: settings.minimap },
      fontSize: settings.fontSize,
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      lineHeight: Math.round(settings.fontSize * 1.6),
      padding: { top: 12 },
      renderLineHighlight: "all",
      smoothScrolling: !reducedMotion,
      cursorSmoothCaretAnimation: reducedMotion ? "off" : "explicit",
      cursorBlinking: reducedMotion ? "solid" : "blink",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: 2,
      wordWrap: settings.wordWrap ? "on" : "off",
      fixedOverflowWidgets: true,
      // The shadow-DOM context menu mounts outside .monaco-editor, so it misses the theme's CSS variables.
      useShadowDOM: false,
    }),
    [path, settings, reducedMotion],
  );

  if (!ready) {
    if (error) {
      return (
        <div role="alert" className="space-y-3 p-4 text-sm">
          <p>{error} Check your connection, then try again.</p>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={retry}
            >
              Try again
            </Button>

            <Button size="sm" variant="outline" onClick={onUsePlainText}>
              Use the plain text editor
            </Button>
          </div>
        </div>
      );
    }

    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        Loading editor…
      </p>
    );
  }

  return (
    <Editor
      height="100%"
      path={modelUri(workspaceId, path)}
      theme={monacoThemeName(theme)}
      language={languageFor(path)}
      value={files[path] ?? ""}
      keepCurrentModel
      onChange={handleChange}
      onMount={handleMount}
      loading={null}
      options={options}
    />
  );
}
