export type CompletionContext =
  | { kind: "annotation" }
  | { kind: "imports"; module?: string; prefix: string }
  | { kind: "member"; receiver: string }
  | { kind: "code" };

export function completionContext(
  before: string,
  language: string,
): CompletionContext {
  if (language === "python") {
    const fromImport =
      /^\s*from\s+([\w.]+)\s+import\s+(?:[\w]+\s*,\s*)*([\w]*)$/.exec(before);

    if (fromImport) {
      return { kind: "imports", module: fromImport[1], prefix: fromImport[2] };
    }

    const moduleImport = /^\s*(?:from|import)\s+([\w.]*)$/.exec(before);

    if (moduleImport) {
      return { kind: "imports", prefix: moduleImport[1] };
    }
  } else {
    const javaImport = /^\s*import\s+([\w.]*)$/.exec(before);

    if (javaImport) {
      return { kind: "imports", prefix: javaImport[1] };
    }
  }

  const member = /\b([A-Za-z_]\w*)\.\w*$/.exec(before);

  if (member) {
    return { kind: "member", receiver: member[1] };
  }

  if (/@\w*$/.test(before)) {
    return { kind: "annotation" };
  }

  return { kind: "code" };
}
