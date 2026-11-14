import type * as Monaco from "monaco-editor";
import {
  isManifest,
  manifestFrameworks,
  sourceFrameworks,
  workspacePrefix,
} from "./frameworks.ts";
import { completionLanguages } from "./languages.ts";
import { selectItems } from "./selection.ts";
import type { CompletionLanguage } from "./selection.ts";
import { toSuggestion } from "./suggestion.ts";
import type { Framework } from "./types.ts";

const registered = new WeakSet<typeof Monaco>();

type DetectionCache = {
  signature: string;
  frameworks: Set<Framework>;
};

function workspaceManifests(monaco: typeof Monaco, prefix: string | undefined) {
  if (!prefix) {
    return [];
  }

  return monaco.editor.getModels().filter((sibling) => {
    const inWorkspace = sibling.uri.toString().startsWith(prefix);

    return inWorkspace && isManifest(sibling.uri.path);
  });
}

function frameworkDetector(monaco: typeof Monaco) {
  const cache = new WeakMap<Monaco.editor.ITextModel, DetectionCache>();
  const workspaceCache = new Map<string, DetectionCache>();

  return (model: Monaco.editor.ITextModel): Set<Framework> => {
    const prefix = workspacePrefix(model.uri.toString());
    const manifests = workspaceManifests(monaco, prefix);

    // Model ids and versions change whenever a file is created, replaced or edited.
    const manifestSignature = JSON.stringify(
      manifests.map((manifest) => [
        manifest.id,
        manifest.uri.toString(),
        manifest.getVersionId(),
      ]),
    );
    const signature = `${model.getVersionId()}:${manifestSignature}`;

    const previous = cache.get(model);

    if (previous?.signature === signature) {
      return previous.frameworks;
    }

    const workspaceKey = prefix ?? "";
    let workspace = workspaceCache.get(workspaceKey);

    if (workspace?.signature !== manifestSignature) {
      const files = manifests.map((manifest) => ({
        path: manifest.uri.path,
        content: manifest.getValue(),
      }));

      workspace = {
        signature: manifestSignature,
        frameworks: manifestFrameworks(files),
      };

      workspaceCache.set(workspaceKey, workspace);
    }

    const frameworks = new Set([
      ...workspace.frameworks,
      ...sourceFrameworks(model.getValue()),
    ]);

    cache.set(model, { signature, frameworks });

    return frameworks;
  };
}

function completionProvider(
  monaco: typeof Monaco,
  language: CompletionLanguage,
  detect: (model: Monaco.editor.ITextModel) => Set<Framework>,
): Monaco.languages.CompletionItemProvider {
  return {
    triggerCharacters: ["@", ".", " "],
    provideCompletionItems(model, position) {
      const frameworks = detect(model);
      const source = model.getValue();
      const before = model
        .getLineContent(position.lineNumber)
        .slice(0, position.column - 1);
      const word = model.getWordUntilPosition(position);

      const selection = selectItems(language, {
        path: model.uri.path,
        source,
        before,
        frameworks,
      });

      if (!selection) {
        return { suggestions: [] };
      }

      const { context, prefix, items } = selection;
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      if (prefix !== undefined) {
        range.startColumn = position.column - prefix.length;
      }

      const suggestions = items.map((item) => {
        const insertText = language.insertText(item, context);
        const importEdit = language.importEdit(source, item, context);

        return toSuggestion(monaco, item, { insertText, range, importEdit });
      });

      return { suggestions };
    },
  };
}

export function registerFrameworkCompletions(monaco: typeof Monaco): void {
  if (registered.has(monaco)) {
    return;
  }

  registered.add(monaco);
  const detect = frameworkDetector(monaco);

  for (const [languageId, language] of Object.entries(completionLanguages)) {
    monaco.languages.registerCompletionItemProvider(
      languageId,
      completionProvider(monaco, language, detect),
    );
  }
}
