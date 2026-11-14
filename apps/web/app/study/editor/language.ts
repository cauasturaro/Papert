const languages: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  markdown: "markdown",
  css: "css",
  scss: "scss",
  less: "less",
  html: "html",
  htm: "html",
  py: "python",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  cs: "csharp",
  go: "go",
  rs: "rust",
  rb: "ruby",
  php: "php",
  kt: "kotlin",
  swift: "swift",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
  xml: "xml",
  svg: "xml",
  toml: "ini",
  ini: "ini",
  env: "ini",
  graphql: "graphql",
  gql: "graphql",
};

const labels: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  json: "JSON",
  markdown: "Markdown",
  css: "CSS",
  scss: "SCSS",
  less: "Less",
  html: "HTML",
  python: "Python",
  java: "Java",
  c: "C",
  cpp: "C++",
  csharp: "C#",
  go: "Go",
  rust: "Rust",
  ruby: "Ruby",
  php: "PHP",
  kotlin: "Kotlin",
  swift: "Swift",
  shell: "Shell",
  yaml: "YAML",
  sql: "SQL",
  xml: "XML",
  ini: "Config",
  graphql: "GraphQL",
  dockerfile: "Dockerfile",
  plaintext: "Plain text",
};

/** Monaco language ID for a workspace path. */
export function languageFor(path: string) {
  const name = path.split("/").pop() ?? path;

  if (name === "Dockerfile" || name.startsWith("Dockerfile.")) {
    return "dockerfile";
  }

  const extension = name.includes(".")
    ? name.split(".").pop()?.toLowerCase()
    : undefined;

  return languages[extension ?? ""] ?? "plaintext";
}

export function languageLabel(path: string) {
  return labels[languageFor(path)] ?? "Plain text";
}
