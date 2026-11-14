const FILE_EXTENSIONS = new Set([
  "html",
  "htm",
  "css",
  "scss",
  "sass",
  "less",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
  "mts",
  "cts",
  "json",
  "md",
  "mdx",
  "txt",
  "py",
  "ipynb",
  "java",
  "kt",
  "swift",
  "c",
  "h",
  "cpp",
  "hpp",
  "cc",
  "cs",
  "go",
  "rs",
  "rb",
  "php",
  "sql",
  "sh",
  "bash",
  "yml",
  "yaml",
  "toml",
  "ini",
  "xml",
  "svg",
  "vue",
  "svelte",
  "astro",
  "env",
  "gitignore",
  "dockerfile",
  "lock",
  "csv",
  "graphql",
  "prisma",
]);

/**
 * The inline-code value as a workspace path ("src/app.ts", "./index.html"), or null when it
 * reads like code instead ("console.log", "a + b").
 */
export function workspacePath(value: string) {
  const path = value.trim().replace(/^\.\//, "");

  if (!path || path.length > 200 || /^[a-z]+:/i.test(path)) {
    return null;
  }

  if (
    !/^[\w@.\-/]+$/.test(path) ||
    path.includes("//") ||
    path.startsWith("/")
  ) {
    return null;
  }

  const segments = path.split("/").filter(Boolean);
  const name = segments[segments.length - 1] ?? "";
  const extension = name.includes(".")
    ? name.slice(name.lastIndexOf(".") + 1).toLowerCase()
    : "";

  if (FILE_EXTENSIONS.has(extension)) {
    return path;
  }

  // Folders and extensionless files need a slash to look like a path.
  if (
    segments.length > 1 &&
    segments.every((segment) => /^[\w@.-]+$/.test(segment))
  ) {
    return path.replace(/\/$/, "");
  }

  return null;
}
