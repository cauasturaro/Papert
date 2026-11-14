import test from "node:test";
import assert from "node:assert/strict";
import { diffFiles, diffLines } from "./line-diff.ts";

test("keeps common lines and marks removed before added lines", () => {
  const before = "a\nb\nc";
  const after = "a\nB\nc\nd";

  const lines = diffLines(before, after);

  assert.deepEqual(lines, [
    { kind: "same", text: "a" },
    { kind: "removed", text: "b" },
    { kind: "added", text: "B" },
    { kind: "same", text: "c" },
    { kind: "added", text: "d" },
  ]);
});

test("treats empty text as no lines and normalizes Windows line endings", () => {
  assert.deepEqual(diffLines("", "x"), [{ kind: "added", text: "x" }]);
  assert.deepEqual(diffLines("x\r\ny", "x\ny"), [
    { kind: "same", text: "x" },
    { kind: "same", text: "y" },
  ]);
});

test("lists added, removed and changed files by path and skips unchanged ones", () => {
  const before = { "b.ts": "1", "a.ts": "same", "gone.ts": "x" };
  const after = { "b.ts": "2", "a.ts": "same", "new.ts": "y" };

  const changes = diffFiles(before, after);

  assert.deepEqual(
    changes.map((change) => [change.path, change.change]),
    [
      ["b.ts", "changed"],
      ["gone.ts", "removed"],
      ["new.ts", "added"],
    ],
  );
});
