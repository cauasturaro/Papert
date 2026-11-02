"use client";

import { useEffect, useState } from "react";
import type * as Monaco from "monaco-editor";
import Editor, { loader } from "@monaco-editor/react";
import "../../public/monaco/editor.css";

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
  onChange,
}: {
  path: string;
  value: string;
  onChange: (value: string) => void;
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

  const extension = path.split(".").pop()?.toLowerCase();
  const languages: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    py: "python",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
    json: "json",
    md: "markdown",
  };
  const language =
    path.split("/").pop() === "Dockerfile"
      ? "dockerfile"
      : (languages[extension ?? ""] ?? "plaintext");

  if (!ready) {
    return (
      <p className="p-4" role="status">
        {error || "Loading editor…"}
      </p>
    );
  }

  return (
    <Editor
      height="100%"
      path={path}
      language={language}
      value={value}
      onChange={(content) => onChange(content ?? "")}
      loading={
        <p className="p-4" role="status">
          Loading editor…
        </p>
      }
      options={{
        ariaLabel: `Code editor: ${path}`,
        minimap: { enabled: false },
        fontSize: 14,
        padding: { top: 16 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        wordWrap: "on",
        fixedOverflowWidgets: true,
      }}
    />
  );
}
