export type DiffLine = {
  kind: "same" | "added" | "removed";
  text: string;
};

// Above this many line pairs the LCS table gets large; the diff then compares whole files.
const MAX_CELLS = 400_000;

function splitLines(text: string) {
  if (text === "") {
    return [];
  }

  return text.replace(/\r\n/g, "\n").split("\n");
}

/** Line diff from a longest-common-subsequence table: removed lines come before added ones. */
export function diffLines(before: string, after: string): DiffLine[] {
  const old = splitLines(before);
  const next = splitLines(after);

  if (old.length * next.length > MAX_CELLS) {
    return [
      ...old.map((text) => ({ kind: "removed" as const, text })),
      ...next.map((text) => ({ kind: "added" as const, text })),
    ];
  }

  // lengths[i][j] is the LCS length of old[i..] and next[j..].
  const lengths = Array.from({ length: old.length + 1 }, () =>
    new Array<number>(next.length + 1).fill(0),
  );

  for (let i = old.length - 1; i >= 0; i--) {
    for (let j = next.length - 1; j >= 0; j--) {
      lengths[i][j] =
        old[i] === next[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;

  while (i < old.length && j < next.length) {
    if (old[i] === next[j]) {
      lines.push({ kind: "same", text: old[i] });
      i++;
      j++;
    } else if (lengths[i + 1][j] >= lengths[i][j + 1]) {
      lines.push({ kind: "removed", text: old[i] });
      i++;
    } else {
      lines.push({ kind: "added", text: next[j] });
      j++;
    }
  }

  for (; i < old.length; i++) {
    lines.push({ kind: "removed", text: old[i] });
  }

  for (; j < next.length; j++) {
    lines.push({ kind: "added", text: next[j] });
  }

  return lines;
}

export type FileChange = {
  path: string;
  change: "added" | "removed" | "changed";
  lines: DiffLine[];
};

/** Per-file changes between two attempts' files, sorted by path; unchanged files are left out. */
export function diffFiles(
  before: Record<string, string>,
  after: Record<string, string>,
): FileChange[] {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const changes: FileChange[] = [];

  paths.sort();

  for (const path of paths) {
    const inBefore = Object.hasOwn(before, path);
    const inAfter = Object.hasOwn(after, path);

    if (inBefore && inAfter && before[path] === after[path]) {
      continue;
    }

    let change: FileChange["change"] = "changed";

    if (!inBefore) {
      change = "added";
    } else if (!inAfter) {
      change = "removed";
    }

    const lines = diffLines(before[path] ?? "", after[path] ?? "");

    changes.push({ path, change, lines });
  }

  return changes;
}
