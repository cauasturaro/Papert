import type * as Monaco from "monaco-editor";
import type { Files } from "../workspace/workspace-tree";
import { languageFor } from "./language";

const MODEL_ROOT = "/papert/";

/** Model URI for a workspace file; TypeScript resolves relative imports between them. */
export function modelUri(workspaceId: string, path: string) {
  return `file://${MODEL_ROOT}${workspaceId}/${path}`;
}

/**
 * Keeps one model per workspace file: creates missing ones, updates text changed outside
 * the editor (undo kept), and disposes models of deleted files or other workspaces.
 */
// Text each model last received from `files`, by model URI. Unchanged files keep their
// string, so a reference check skips them without reading the model's whole text.
const syncedContent = new Map<string, string>();

export function syncModels(
  monaco: typeof Monaco,
  workspaceId: string,
  files: Files,
  active: string | null,
) {
  const prefix = `${MODEL_ROOT}${workspaceId}/`;
  const wanted = new Set<string>();

  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith("/")) {
      continue;
    }

    const uri = monaco.Uri.parse(modelUri(workspaceId, path));
    const key = uri.toString();
    const model = monaco.editor.getModel(uri);
    wanted.add(key);

    if (!model) {
      monaco.editor.createModel(content, languageFor(path), uri);
      syncedContent.set(key, content);
      continue;
    }

    if (syncedContent.get(key) === content) {
      continue;
    }

    syncedContent.set(key, content);

    // The visible editor applies its own value; other files only change on reloads and undo.
    if (path !== active && model.getValue() !== content) {
      model.pushEditOperations(
        [],
        [{ range: model.getFullModelRange(), text: content }],
        () => null,
      );
    }
  }

  for (const model of monaco.editor.getModels()) {
    const { path } = model.uri;
    const ours = model.uri.scheme === "file" && path.startsWith(MODEL_ROOT);
    const stale = !path.startsWith(prefix) || !wanted.has(model.uri.toString());

    if (ours && stale) {
      syncedContent.delete(model.uri.toString());
      model.dispose();
    }
  }
}
