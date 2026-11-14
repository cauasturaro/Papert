export type JavaImportEdit = {
  lineNumber: number;
  column: number;
  text: string;
};

export function javaImportEdit(
  source: string,
  imports: string[],
): JavaImportEdit | undefined {
  const lines = source.split(/\r?\n/);
  const eol = source.includes("\r\n") ? "\r\n" : "\n";

  const existing = lines.flatMap(
    (line) =>
      /^\s*import\s+([\w.*]+)\s*;?\s*(?:\/\/.*)?$/.exec(line)?.[1] ?? [],
  );
  const missing = [...new Set(imports)].filter(
    (name) =>
      !existing.includes(name) &&
      !existing.includes(`${name.slice(0, name.lastIndexOf("."))}.*`),
  );

  if (missing.length === 0) {
    return undefined;
  }

  let afterLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (
      /^\s*(?:package|import(?:\s+static)?)\s+[\w.*]+\s*;?\s*(?:\/\/.*)?$/.test(
        lines[index],
      )
    ) {
      afterLine = index;
    }
  }

  const text = missing.map((name) => `import ${name};`).join(eol);

  if (afterLine < 0) {
    return { lineNumber: 1, column: 1, text: `${text}${eol}${eol}` };
  }

  return {
    lineNumber: afterLine + 1,
    column: lines[afterLine].length + 1,
    text: `${eol}${text}`,
  };
}
