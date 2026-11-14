import { configCatalog } from "./config.ts";
import { completionContext } from "./cursor-context.ts";
import type { CompletionContext } from "./cursor-context.ts";
import { djangoCatalog } from "./django.ts";
import { fastapiCatalog } from "./fastapi.ts";
import { flaskCatalog } from "./flask.ts";
import { javaImportEdit } from "./java-imports.ts";
import { javaCatalog } from "./java.ts";
import { langchainCatalog } from "./langchain.ts";
import { pydanticCatalog } from "./pydantic.ts";
import { pythonModules } from "./python-modules.ts";
import { receiverType } from "./python-receivers.ts";
import { pythonCatalog } from "./python.ts";
import type { CompletionLanguage, CursorPosition } from "./selection.ts";
import { sqlalchemyCatalog } from "./sqlalchemy.ts";
import type { CatalogItem, Framework } from "./types.ts";

export const allPythonItems = [
  ...flaskCatalog,
  ...fastapiCatalog,
  ...djangoCatalog,
  ...pydanticCatalog,
  ...sqlalchemyCatalog,
  ...langchainCatalog,
  ...pythonCatalog,
];

function exportKind(name: string): CatalogItem["kind"] {
  if (/^[A-Z_]+$/.test(name)) {
    return "Constant";
  }

  if (/^[A-Z]/.test(name)) {
    return "Class";
  }

  return "Function";
}

function pythonImportItems(
  frameworks: Set<Framework>,
  module?: string,
): CatalogItem[] {
  const modules = pythonModules.filter(
    (entry) => !entry.framework || frameworks.has(entry.framework),
  );

  if (module) {
    const entry = modules.find((entry) => entry.module === module);

    return (entry?.exports ?? []).map((name) => ({
      label: name,
      insertText: name,
      documentation: `Import from \`${module}\`.`,
      kind: exportKind(name),
      framework: entry?.framework,
    }));
  }

  return modules.map((entry) => ({
    label: entry.module,
    insertText: entry.module,
    documentation: `Python module \`${entry.module}\`.`,
    framework: entry.framework,
    kind: "Module",
  }));
}

function javaImportItems(frameworks: Set<Framework>): CatalogItem[] {
  const names = new Set(
    javaCatalog
      .filter((entry) => !entry.framework || frameworks.has(entry.framework))
      .flatMap((entry) => entry.imports ?? []),
  );

  return [...names].map((name) => ({
    label: name,
    insertText: name,
    documentation: `Import \`${name}\`.`,
    kind: "Class",
  }));
}

function sourceCursorPosition(
  language: "java" | "python",
): (before: string) => CursorPosition {
  return (before) => {
    const context = completionContext(before, language);

    if (context.kind === "imports") {
      return { context, prefix: context.prefix };
    }

    return { context };
  };
}

const java: CompletionLanguage = {
  catalog: javaCatalog,
  acceptsDocument: () => true,
  cursorPosition: sourceCursorPosition("java"),
  importItems: javaImportItems,
  memberReceiver: (_source, receiver) => receiver,
  isAnnotation: (item) => item.context === "annotation",
  insertText: (item) => item.insertText,
  importEdit(source, item, context) {
    if (context.kind === "imports") {
      return undefined;
    }

    return javaImportEdit(source, item.imports ?? []);
  },
};

const python: CompletionLanguage = {
  catalog: allPythonItems,
  acceptsDocument: () => true,
  cursorPosition: sourceCursorPosition("python"),
  importItems: pythonImportItems,
  memberReceiver: receiverType,
  isAnnotation: (item) =>
    item.context === "annotation" || item.insertText.startsWith("@"),
  insertText(item, context) {
    // The typed at sign stays in the document, so decorators must not repeat it.
    if (context.kind === "annotation") {
      return item.insertText.slice(1);
    }

    return item.insertText;
  },
  importEdit: () => undefined,
};

const codeContext: CompletionContext = { kind: "code" };

function springConfig(
  insertText: (item: CatalogItem) => string,
): CompletionLanguage {
  return {
    catalog: configCatalog,
    acceptsDocument(path, frameworks) {
      const applicationFile =
        /(?:^|\/)application(?:-[^/]+)?\.(?:ya?ml|properties)$/.test(path);

      return applicationFile && frameworks.has("spring");
    },
    cursorPosition(before) {
      const key = /^\s*([\w.-]*)$/.exec(before)?.[1];

      if (key === undefined) {
        return undefined;
      }

      return { context: codeContext, prefix: key };
    },
    importItems: () => [],
    memberReceiver: () => undefined,
    isAnnotation: () => false,
    insertText,
    importEdit: () => undefined,
  };
}

export const completionLanguages: Record<string, CompletionLanguage> = {
  java,
  python,
  yaml: springConfig((item) => item.insertText.replace("=", ": ")),
  ini: springConfig((item) => item.insertText),
};
