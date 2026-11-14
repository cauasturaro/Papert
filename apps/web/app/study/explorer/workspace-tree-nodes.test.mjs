import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyNodeChange,
  changedPath,
  rejectionReason,
  toTreeNodes,
} from "./workspace-tree-nodes.ts";

const files = {
  "src/main.ts": "main",
  "src/lib/util.ts": "util",
  "README.md": "readme",
  "docs/": "",
};

const draft = (label) => ({ id: "draft", label });

test("builds nested nodes with directories first and path IDs", () => {
  const nodes = toTreeNodes(files);

  const rootIds = nodes.map((node) => node.id);
  const source = nodes.find((node) => node.id === "src/");

  assert.deepEqual(rootIds, ["docs/", "src/", "README.md"]);
  assert.deepEqual(
    source.children.map((node) => [node.id, node.label, node.data.kind]),
    [
      ["src/lib/", "lib", "directory"],
      ["src/main.ts", "main.ts", "file"],
    ],
  );
  assert.deepEqual(nodes[0].children, []);
});

test("creates files and directories inside the chosen parent", () => {
  const createFile = {
    type: "create",
    parentId: "src/",
    index: 0,
    node: draft("app.ts"),
  };
  const createDirectory = {
    type: "create",
    parentId: null,
    index: 0,
    node: draft("tests/"),
  };

  const withFile = applyNodeChange(files, createFile);
  const withDirectory = applyNodeChange(files, createDirectory);

  assert.equal(withFile["src/app.ts"], "");
  assert.equal(withDirectory["tests/"], "");
  assert.equal(changedPath(createFile), "src/app.ts");
  assert.equal(changedPath(createDirectory), "tests/");
});

test("renames in place and moves across directories with content", () => {
  const rename = { type: "rename", id: "src/main.ts", label: "index.ts" };
  const move = { type: "move", id: "src/lib/", parentId: "docs/", index: 0 };

  const renamed = applyNodeChange(files, rename);
  const moved = applyNodeChange(files, move);

  assert.equal(renamed["src/index.ts"], "main");
  assert.equal(renamed["src/main.ts"], undefined);
  assert.equal(moved["docs/lib/util.ts"], "util");
  assert.equal(changedPath(rename), "src/index.ts");
  assert.equal(changedPath(move), "docs/lib/");
});

test("removes a directory with its descendants", () => {
  const removed = applyNodeChange(files, { type: "remove", id: "src/" });

  assert.deepEqual(Object.keys(removed).sort(), ["README.md", "docs/"]);
});

test("rejects reordering, children under files and invalid paths", () => {
  const reorder = {
    type: "move",
    id: "src/main.ts",
    parentId: "src/",
    index: 0,
  };
  const underFile = {
    type: "create",
    parentId: "README.md",
    index: 0,
    node: draft("child.ts"),
  };
  const invalidName = {
    type: "create",
    parentId: null,
    index: 0,
    node: draft("bad name.ts"),
  };
  const duplicate = { type: "rename", id: "README.md", label: "src" };

  assert.match(rejectionReason(files, reorder), /sorted by name/);
  assert.match(rejectionReason(files, underFile), /cannot contain/);
  assert.match(rejectionReason(files, invalidName), /relative paths/);
  assert.match(rejectionReason(files, duplicate), /already exists/);
  assert.equal(
    rejectionReason(files, { type: "remove", id: "README.md" }),
    undefined,
  );
});
