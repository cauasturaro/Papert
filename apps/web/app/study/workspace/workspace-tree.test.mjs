import assert from "node:assert/strict";
import { test } from "node:test";
import {
  sameFiles,
  restoreEntries,
  createEntry,
  renameEntry,
  removeEntry,
  treePaths,
  validateTree,
} from "./workspace-tree.ts";

test("creates nested files and empty directories without overwriting content", () => {
  const original = { "src/main.ts": "code" };
  const created = createEntry(original, "tests/empty/");

  assert.deepEqual(treePaths(created), [
    "src/",
    "src/main.ts",
    "tests/",
    "tests/empty/",
  ]);
  assert.deepEqual(original, { "src/main.ts": "code" });
  assert.throws(() => createEntry(original, "src/main.ts"), /already exists/);
  assert.throws(() => createEntry(original, "src"), /already exists/);
  assert.throws(
    () => createEntry(original, "src/main.ts/child"),
    /parent directory/,
  );
});

test("renames whole directories and removes only their own descendants", () => {
  const original = {
    "src/main.ts": "code",
    "src/nested/": "",
    "src2/keep.ts": "keep",
  };
  const renamed = renameEntry(original, "src/", "lib");

  assert.deepEqual(renamed, {
    "lib/main.ts": "code",
    "lib/nested/": "",
    "src2/keep.ts": "keep",
  });
  assert.deepEqual(removeEntry(renamed, "lib/"), { "src2/keep.ts": "keep" });
  assert.equal(original["src/main.ts"], "code");
  assert.throws(
    () => renameEntry(original, "src/", "src/nested"),
    /inside itself/,
  );
  assert.throws(() => renameEntry(original, "src/", "src2"), /already exists/);
  assert.throws(
    () => renameEntry(original, "src/main.ts", "src2/keep.ts"),
    /already exists/,
  );
});

test("rejects unsafe paths, collisions and byte limits", () => {
  for (const path of [
    "../secret",
    "/absolute",
    "src//file",
    "src\\file",
    "src/../file",
    "constructor/file",
    "prototype/",
    "__proto__/file",
    "/",
  ]) {
    assert.throws(() => validateTree({ [path]: "" }));
  }

  assert.throws(() => validateTree({ "src/": "content" }));
  assert.throws(() => validateTree({ src: "", "src/": "" }));
  assert.throws(
    () => validateTree({ "main.ts": "a".repeat(16001) }),
    /16,000 characters/,
  );
  assert.throws(
    () =>
      validateTree(
        Object.fromEntries(
          Array.from({ length: 21 }, (_, index) => [`file${index}`, ""]),
        ),
      ),
    /20 entries/,
  );
  assert.throws(
    () =>
      validateTree(
        Object.fromEntries(
          Array.from({ length: 5 }, (_, index) => [
            `file${index}`,
            "a".repeat(16000),
          ]),
        ),
      ),
    /64 KB/,
  );
});

test("compares files independently of PostgreSQL JSONB key ordering", () => {
  assert.equal(
    sameFiles(
      { "long-file.ts": "code", a: "" },
      { a: "", "long-file.ts": "code" },
    ),
    true,
  );
  assert.equal(sameFiles({ a: "" }, { a: "changed" }), false);
  assert.equal(sameFiles({ a: "" }, { b: "" }), false);
});


test("undo preserves a recreated file and rejects parent collisions", () => {
  const removed = { "main.ts": "old content" };
  const recreated = { "main.ts": "new content" };

  assert.throws(() => restoreEntries(recreated, removed), /already exists/);
  assert.equal(recreated["main.ts"], "new content");
  assert.throws(() => restoreEntries({ "main.ts/child": "" }, removed), /already exists/);
  assert.throws(() => restoreEntries({ src: "" }, { "src/main.ts": "" }), /parent directory/);
});

test("restores removed entries without changing existing files", () => {
  const files = { "keep.ts": "keep" };

  const restored = restoreEntries(files, { "main.ts": "old content" });

  assert.deepEqual(restored, { "keep.ts": "keep", "main.ts": "old content" });
  assert.deepEqual(files, { "keep.ts": "keep" });
});
