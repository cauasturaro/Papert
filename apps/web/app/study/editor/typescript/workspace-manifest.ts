type WorkspaceFiles = Record<string, string>;

export function parseJsonc(content: string): Record<string, unknown> {
  try {
    const uncommented = content.replace(
      /"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
      (token) =>
        token.startsWith('"') ? token : token.replace(/[^\r\n]/g, " "),
    );
    const normalized = uncommented.replace(
      /("(?:\\.|[^"\\])*")|,(\s*[}\]])/g,
      (_token, string, closing) => string ?? closing,
    );
    const value: unknown = JSON.parse(normalized);

    return isObject(value) ? value : {};
  } catch {
    return {};
  }
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function dependencyNames(files: WorkspaceFiles): string[] {
  const manifest = parseJsonc(files["package.json"] ?? "{}");
  const names = new Set<string>();

  for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
    const dependencies = manifest[field];
    if (isObject(dependencies)) {
      Object.keys(dependencies).forEach((name) => names.add(name));
    }
  }

  return [...names].sort();
}
