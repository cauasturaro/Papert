import type * as Monaco from "monaco-editor";
import type { JavaImportEdit } from "./java-imports.ts";
import type { CatalogItem } from "./types.ts";

export type SuggestionOptions = {
  insertText: string;
  range: Monaco.IRange;
  importEdit?: JavaImportEdit;
};

function importTextEdits(
  importEdit: JavaImportEdit,
): Monaco.languages.TextEdit[] {
  return [
    {
      range: {
        startLineNumber: importEdit.lineNumber,
        endLineNumber: importEdit.lineNumber,
        startColumn: importEdit.column,
        endColumn: importEdit.column,
      },
      text: importEdit.text,
    },
  ];
}

export function toSuggestion(
  monaco: typeof Monaco,
  item: CatalogItem,
  { insertText, range, importEdit }: SuggestionOptions,
): Monaco.languages.CompletionItem {
  // Monaco additional edits must not overlap the completion replacement.
  const overlaps =
    importEdit &&
    importEdit.lineNumber === range.startLineNumber &&
    importEdit.column >= range.startColumn &&
    importEdit.column <= range.endColumn;

  let text = insertText;
  let additionalTextEdits: Monaco.languages.TextEdit[] | undefined;

  if (importEdit && overlaps) {
    text = `${importEdit.text}${insertText}`;
  }

  if (importEdit && !overlaps) {
    additionalTextEdits = importTextEdits(importEdit);
  }

  const importDocumentation = item.imports
    ?.map((name) => `\`${name}\``)
    .join("\n\n");
  const documentation = [item.documentation, importDocumentation]
    .filter(Boolean)
    .join("\n\n");

  return {
    label: item.label,
    kind: monaco.languages.CompletionItemKind[item.kind ?? "Snippet"],
    insertText: text,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range: { ...range },
    detail: item.framework ?? "Language pattern",
    documentation: { value: documentation },
    sortText: `${item.framework ? "0" : "1"}-${item.label}`,
    additionalTextEdits,
  };
}
