"use client";

import { useEffect, useState } from "react";
import type * as Monaco from "monaco-editor";
import Editor, { loader } from "@monaco-editor/react";
import type { ResolvedTheme } from "@/lib/theme";
import { languageFor } from "./language";
import { defineMonacoThemes, monacoThemeName } from "./monaco-themes";
import "../../../public/monaco/editor.css";

declare global {
  interface Window {
    papertMonaco?: typeof Monaco;
    MonacoEnvironment?: Monaco.Environment;
  }
}

let loading: Promise<void> | undefined;

function loadMonaco() {
  if (!loading) {
    window.MonacoEnvironment = {
      getWorker: (_id, label) => {
        let name = "editor";
        if (label === "typescript" || label === "javascript") {
          name = "ts";
        } else if (label === "json") {
          name = "json";
        }

        return new Worker(`/monaco/${name}.worker.js`, { type: "module" });
      },
    };

    loading = new Promise<void>((resolve, reject) => {
      const script = document.createElement("script");
      script.type = "module";
      script.src = "/monaco/editor.js";
      script.onload = () => {
        if (!window.papertMonaco) {
          reject(new Error("Editor did not initialize."));
          return;
        }

        loader.config({ monaco: window.papertMonaco });
        defineMonacoThemes(window.papertMonaco);
        resolve();
      };
      script.onerror = () => {
        loading = undefined;
        script.remove();
        reject(new Error("Unable to load editor."));
      };

      document.head.appendChild(script);
    });
  }

  return loading;
}

export function CodeEditor({
  path,
  value,
  theme,
  onChange,
  onSelectionChange,
}: {
  path: string;
  value: string;
  theme: ResolvedTheme;
  onChange: (value: string) => void;
  onSelectionChange: (range: { start: number; end: number }) => void;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    void loadMonaco()
      .then(() => {
        if (active) {
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setError(
            "Unable to load Monaco. Use the plain text editor to continue.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const language = languageFor(path);

  if (!ready) {
    return (
      <p className="p-4 text-sm text-muted-foreground" role="status">
        {error || "Loading editor…"}
      </p>
    );
  }

  return (
    <Editor
      height="100%"
      path={path}
      theme={monacoThemeName(theme)}
      language={language}
      value={value}
      onChange={(content) => onChange(content ?? "")}
      onMount={(editor) => {
        editor.onDidChangeCursorSelection((event) => {
          const model = editor.getModel();
          if (!model) {
            return;
          }

          const start = model.getOffsetAt(event.selection.getStartPosition());
          const end = model.getOffsetAt(event.selection.getEndPosition());

          onSelectionChange({ start, end });
        });
      }}
      loading={
        <p className="p-4 text-sm text-muted-foreground" role="status">
          Loading editor…
        </p>
      }
      options={{
        ariaLabel: `Code editor: ${path}`,
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        lineHeight: 21,
        padding: { top: 12 },
        renderLineHighlight: "all",
        smoothScrolling: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        fixedOverflowWidgets: true,
        // The shadow-DOM context menu mounts outside .monaco-editor, so it misses the theme's CSS variables.
        useShadowDOM: false,
      }}
    />
  );
}
