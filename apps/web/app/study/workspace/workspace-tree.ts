export const MAX_ENTRIES = 20;
export const MAX_BYTES = 64_000;
export const MAX_FILE_CHARACTERS = 16_000;

export type Files = Record<string, string>;

export function sameFiles(left: Files, right: Files) {
  const paths = Object.keys(left);

  return (
    paths.length === Object.keys(right).length &&
    paths.every(
      (path) => Object.hasOwn(right, path) && left[path] === right[path],
    )
  );
}

export function treePaths(files: Files) {
  const paths = new Set(Object.keys(files));

  for (const path of Object.keys(files)) {
    const parts = path.replace(/\/$/, "").split("/");

    for (let index = 1; index < parts.length; index += 1) {
      paths.add(`${parts.slice(0, index).join("/")}/`);
    }
  }

  return [...paths].sort();
}

export function validateTree(files: Files) {
  const entries = Object.entries(files);
  if (
    entries.length > MAX_ENTRIES ||
    new TextEncoder().encode(JSON.stringify(files)).length > MAX_BYTES
  ) {
    throw new Error("Use up to 20 entries and 64 KB per workspace.");
  }

  for (const [path, content] of entries) {
    const name = path.replace(/\/$/, "");
    const parts = name.split("/");
    const valid =
      path.length <= 200 &&
      parts.every(
        (part) =>
          /^[a-zA-Z0-9_.-]+$/.test(part) &&
          ![".", "..", "__proto__", "constructor", "prototype"].includes(part),
      );
    if (!valid) {
      throw new Error(
        "Use relative paths with letters, numbers, dots, underscores or hyphens.",
      );
    }

    if (content.length > MAX_FILE_CHARACTERS) {
      throw new Error("Each file can contain up to 16,000 characters.");
    }

    if (path.endsWith("/") && (content !== "" || Object.hasOwn(files, name))) {
      throw new Error(
        "A directory cannot contain text or share a path with a file.",
      );
    }

    for (let index = 1; index < parts.length; index += 1) {
      if (Object.hasOwn(files, parts.slice(0, index).join("/"))) {
        throw new Error("A file cannot also be a parent directory.");
      }
    }
  }
}

export function createEntry(files: Files, path: string) {
  if (
    treePaths(files).includes(path) ||
    treePaths(files).includes(`${path}/`)
  ) {
    throw new Error("That path already exists.");
  }

  const updated = { ...files, [path]: "" };
  validateTree(updated);

  return updated;
}

export function renameEntry(files: Files, path: string, destination: string) {
  const directory = path.endsWith("/");
  const target = directory ? `${destination.replace(/\/$/, "")}/` : destination;
  if (target === path) {
    return files;
  }

  if (directory && target.startsWith(path)) {
    throw new Error("A directory cannot be moved inside itself.");
  }

  const affected = Object.keys(files).filter(
    (entry) => entry === path || (directory && entry.startsWith(path)),
  );
  const updated = { ...files };

  for (const entry of affected) {
    delete updated[entry];
  }

  if (
    treePaths(updated).includes(target) ||
    treePaths(updated).includes(`${target}/`)
  ) {
    throw new Error("That path already exists.");
  }

  for (const entry of affected) {
    const moved = `${target}${entry.slice(path.length)}`;
    if (Object.hasOwn(updated, moved)) {
      throw new Error("Renaming would overwrite another file.");
    }

    updated[moved] = files[entry];
  }

  validateTree(updated);

  return updated;
}

export function removeEntry(files: Files, path: string) {
  return Object.fromEntries(
    Object.entries(files).filter(
      ([entry]) =>
        entry !== path && !(path.endsWith("/") && entry.startsWith(path)),
    ),
  );
}


export function restoreEntries(files: Files, entries: Files) {
  const existing = new Set(treePaths(files));

  for (const path of Object.keys(entries)) {
    if (existing.has(path) || existing.has(`${path}/`)) {
      throw new Error("That path already exists.");
    }
  }

  const restored = { ...files, ...entries };
  validateTree(restored);

  return restored;
}
