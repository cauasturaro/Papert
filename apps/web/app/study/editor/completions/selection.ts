import type { CompletionContext } from "./cursor-context.ts";
import type { JavaImportEdit } from "./java-imports.ts";
import type { CatalogItem, Framework } from "./types.ts";

export type CursorPosition = {
  context: CompletionContext;
  // Text before the cursor that the suggestion replaces instead of the current word.
  prefix?: string;
};

export type CompletionLanguage = {
  catalog: CatalogItem[];
  acceptsDocument(path: string, frameworks: Set<Framework>): boolean;
  cursorPosition(before: string): CursorPosition | undefined;
  importItems(frameworks: Set<Framework>, module?: string): CatalogItem[];
  memberReceiver(source: string, receiver: string): string | undefined;
  isAnnotation(item: CatalogItem): boolean;
  insertText(item: CatalogItem, context: CompletionContext): string;
  importEdit(
    source: string,
    item: CatalogItem,
    context: CompletionContext,
  ): JavaImportEdit | undefined;
};

export type SelectionRequest = {
  path: string;
  source: string;
  before: string;
  frameworks: Set<Framework>;
};

export type Selection = CursorPosition & { items: CatalogItem[] };

function catalogItems(
  language: CompletionLanguage,
  context: CompletionContext,
  request: SelectionRequest,
): CatalogItem[] {
  let receiver: string | undefined;

  if (context.kind === "member") {
    receiver = language.memberReceiver(request.source, context.receiver);
  }

  return language.catalog.filter((item) => {
    if (item.framework && !request.frameworks.has(item.framework)) {
      return false;
    }

    if (context.kind === "member") {
      return item.context === "member" && item.receiver === receiver;
    }

    if (context.kind === "annotation") {
      return language.isAnnotation(item);
    }

    return !item.context;
  });
}

export function selectItems(
  language: CompletionLanguage,
  request: SelectionRequest,
): Selection | undefined {
  if (!language.acceptsDocument(request.path, request.frameworks)) {
    return undefined;
  }

  const position = language.cursorPosition(request.before);

  if (!position) {
    return undefined;
  }

  const { context } = position;

  if (context.kind === "imports") {
    const items = language.importItems(request.frameworks, context.module);

    return { ...position, items };
  }

  const items = catalogItems(language, context, request);

  return { ...position, items };
}
