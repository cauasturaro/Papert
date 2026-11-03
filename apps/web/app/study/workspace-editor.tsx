"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  createEntry,
  removeEntry,
  renameEntry,
  treePaths,
  type Files,
} from "./workspace-tree";

const CodeEditor = dynamic(
  () => import("./code-editor").then((module) => module.CodeEditor),
  {
    ssr: false,
    loading: () => (
      <p className="p-4" role="status">
        Loading editor…
      </p>
    ),
  },
);

type Props = {
  files: Files;
  savedFiles: Files;
  onChange: (files: Files) => void;
  workspaceId: string;
  tutor: (
    activeFile: string | undefined,
    selection: { start: number; end: number } | undefined,
  ) => React.ReactNode;
};

export function WorkspaceEditor({
  files,
  savedFiles,
  onChange,
  workspaceId,
  tutor,
}: Props) {
  const [plainText, setPlainText] = useState(false);
  const [selection, setSelection] = useState("");
  const [codeSelection, setCodeSelection] = useState<{
    path: string;
    start: number;
    end: number;
  } | null>(null);
  const [operation, setOperation] = useState<"file" | "directory" | "rename">(
    "file",
  );
  const [path, setPath] = useState("");
  const [error, setError] = useState("");
  const [panel, setPanel] = useState("editor");
  const paths = treePaths(files);
  const selected = paths.includes(selection) ? selection : (paths[0] ?? "");
  const isFile = selected !== "" && !selected.endsWith("/");

  function applyOperation(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    try {
      const destination =
        operation === "directory" ? `${path.replace(/\/$/, "")}/` : path;
      const updated =
        operation === "rename"
          ? renameEntry(files, selected, destination)
          : createEntry(files, destination);

      onChange(updated);
      setSelection(
        operation === "rename" && selected.endsWith("/")
          ? `${destination.replace(/\/$/, "")}/`
          : destination,
      );
      setPath("");
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Unable to change the tree.",
      );
    }
  }

  function remove() {
    if (
      !window.confirm(
        `Delete ${selected}${selected.endsWith("/") ? " and all its files" : ""}? This removes the content from your workspace.`,
      )
    ) {
      return;
    }

    onChange(removeEntry(files, selected));
    setSelection("");
    setError("");
  }

  return (
    <section aria-label="Practice workspace" className="space-y-3">
      <nav aria-label="Workspace panels" className="flex gap-2 lg:hidden">
        {["files", "editor", "tutor"].map((name) => (
          <Button
            key={name}
            variant={panel === name ? "default" : "outline"}
            aria-pressed={panel === name}
            onClick={() => setPanel(name)}
          >
            {name[0].toUpperCase() + name.slice(1)}
          </Button>
        ))}
      </nav>

      <div className="workspace-grid">
        <aside
          aria-label="Files and sources"
          className={`workspace-panel space-y-5 ${panel !== "files" ? "hidden lg:block" : ""}`}
        >
          <div>
            <h2 className="text-lg font-semibold">Explorer</h2>
            <p className="text-sm text-foreground/65">
              20 entries · 16k characters per file · 64 KB total
            </p>
          </div>

          <nav
            aria-label="File tree"
            className="flex max-h-72 flex-col gap-1 overflow-auto"
          >
            {paths.length === 0 && (
              <p className="text-sm">
                No files yet. Create your first file below.
              </p>
            )}

            {paths.map((entry) => (
              <button
                key={entry}
                type="button"
                aria-pressed={selected === entry}
                onClick={() => {
                  setSelection(entry);
                  setPath("");
                }}
                className={`rounded px-2 py-2 text-left font-mono text-xs break-all hover:bg-foreground/5 ${selected === entry ? "bg-foreground/10 font-semibold" : ""}`}
                style={{
                  paddingLeft: `${8 + (entry.replace(/\/$/, "").split("/").length - 1) * 12}px`,
                }}
              >
                {entry.endsWith("/") ? "▸ " : "· "}
                {entry}
                {files[entry] !== savedFiles[entry] && (
                  <span aria-label="Unsaved"> *</span>
                )}
              </button>
            ))}
          </nav>

          <form className="space-y-3" onSubmit={applyOperation}>
            <label
              className="block text-sm font-medium"
              htmlFor="tree-operation"
            >
              Tree action
            </label>
            <select
              id="tree-operation"
              className="auth-input"
              value={operation}
              onChange={(event) =>
                setOperation(event.target.value as typeof operation)
              }
            >
              <option value="file">New file</option>
              <option value="directory">New directory</option>
              <option value="rename" disabled={!selected}>
                Rename selected
              </option>
            </select>

            <label className="block text-sm font-medium" htmlFor="entry-path">
              Relative path
            </label>
            <input
              id="entry-path"
              className="auth-input font-mono text-sm"
              placeholder="src/main.ts"
              value={path}
              maxLength={200}
              required
              onChange={(event) => setPath(event.target.value)}
            />
            <Button
              type="submit"
              disabled={operation === "rename" && !selected}
              className="w-full"
            >
              Apply tree action
            </Button>
          </form>

          <Button
            variant="outline"
            disabled={!selected}
            onClick={remove}
            className="w-full"
          >
            Delete selected
          </Button>
          {error && (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          )}

          <div className="border-t border-current/15 pt-4">
            <h3 className="font-semibold">Sources</h3>
            <p className="mt-2 text-sm text-foreground/65">
              No sources attached. Document upload will be available in a later
              phase.
            </p>
          </div>
        </aside>

        <section
          aria-label="Code editor panel"
          className={`min-w-0 overflow-hidden rounded-xl border border-current/15 bg-white text-neutral-900 ${panel !== "editor" ? "hidden lg:block" : ""}`}
        >
          <div className="flex min-h-12 items-center justify-between gap-3 border-b border-neutral-200 px-4 py-3">
            <h2 className="break-all font-mono text-sm font-medium">
              {selected || "Code editor"}
            </h2>
            <span className="shrink-0 text-xs text-neutral-600">
              Static suggestions
            </span>
          </div>

          <div className="flex justify-end border-b border-neutral-200 px-4 py-2">
            <button
              type="button"
              className="text-xs underline"
              aria-pressed={plainText}
              onClick={() => setPlainText(!plainText)}
            >
              {plainText ? "Use Monaco editor" : "Use plain text editor"}
            </button>
          </div>

          <div className="h-[60vh] min-h-80 lg:h-[650px]">
            {isFile && plainText && (
              <textarea
                aria-label={`Code editor: ${selected}`}
                className="h-full w-full resize-none p-4 font-mono text-sm"
                spellCheck={false}
                value={files[selected] ?? ""}
                onChange={(event) =>
                  onChange({ ...files, [selected]: event.target.value })
                }
                onSelect={(event) => {
                  const editor = event.currentTarget;

                  setCodeSelection({
                    path: selected,
                    start: editor.selectionStart,
                    end: editor.selectionEnd,
                  });
                }}
              />
            )}

            {isFile && !plainText && (
              <CodeEditor
                key={`${workspaceId}/${selected}`}
                path={`${workspaceId}/${selected}`}
                value={files[selected] ?? ""}
                onChange={(content) =>
                  onChange({ ...files, [selected]: content })
                }
                onSelectionChange={(range) =>
                  setCodeSelection({ path: selected, ...range })
                }
              />
            )}

            {!isFile && (
              <p className="p-6 text-sm text-neutral-600">
                Select a file to edit, or create one in the explorer.
                Directories contain files and have no editable content.
              </p>
            )}
          </div>
          <p className="border-t border-neutral-200 px-4 py-2 text-xs text-neutral-600">
            {plainText
              ? "Tab moves focus between controls."
              : "Tab inserts indentation. Press Ctrl+M (Windows/Linux) or Ctrl+Shift+M (macOS) to let Tab move focus."}
          </p>
        </section>

        <aside
          aria-label="Seymour tutor"
          className={`workspace-panel ${panel !== "tutor" ? "hidden lg:block" : ""}`}
        >
          {tutor(
            isFile ? selected : undefined,
            codeSelection?.path === selected &&
              files[selected] === savedFiles[selected]
              ? { start: codeSelection.start, end: codeSelection.end }
              : undefined,
          )}
        </aside>
      </div>
    </section>
  );
}
