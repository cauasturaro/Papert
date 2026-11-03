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

const labels: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  yaml: "YAML",
  sql: "SQL",
  json: "JSON",
  markdown: "Markdown",
  dockerfile: "Dockerfile",
  plaintext: "Plain text",
};

/** Monaco language ID for a workspace path. */
export function languageFor(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();

  if (path.split("/").pop() === "Dockerfile") {
    return "dockerfile";
  }

  return languages[extension ?? ""] ?? "plaintext";
}

export function languageLabel(path: string) {
  return labels[languageFor(path)];
}
