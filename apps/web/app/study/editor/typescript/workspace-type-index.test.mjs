import { strict as assert } from "node:assert";
import { test } from "node:test";
import { workspacePackages } from "./type-packs.ts";
import { WorkspaceTypeIndex } from "./workspace-type-index.ts";

const files = {
  "package.json": '{ "dependencies": { "react": "19.0.0" } }',
  "src/app.tsx": 'import express from "express";\n',
  "src/util.ts": 'import { z } from "zod";\n',
  "README.md": 'import "not-code";\n',
};

test("matches the full scan as files are edited, added and deleted", () => {
  const index = new WorkspaceTypeIndex();

  const edited = { ...files, "src/app.tsx": 'import { Hono } from "hono";\n' };
  const added = { ...edited, "src/db.ts": 'import pg from "pg";\n' };
  const deleted = { ...added };
  delete deleted["src/util.ts"];

  for (const snapshot of [files, edited, added, deleted]) {
    assert.equal(
      index.packages(snapshot),
      JSON.stringify(workspacePackages(snapshot)),
    );
  }
});

test("a keystroke rescans only the edited file", () => {
  const scanned = [];
  const large = "x".repeat(10_000);
  const workspace = { ...files, "src/large.ts": large };
  const index = new WorkspaceTypeIndex();
  index.packages(workspace);
  const realMatchAll = String.prototype.matchAll;
  String.prototype.matchAll = function (pattern) {
    scanned.push(this.length);

    return realMatchAll.call(this, pattern);
  };

  const edit = 'import { z } from "zod";\n;';

  try {
    index.packages({ ...workspace, "src/util.ts": edit });
  } finally {
    String.prototype.matchAll = realMatchAll;
  }

  assert.deepEqual(scanned, [edit.length]);
});

test("compiler options ignore file contents and follow config and file names", () => {
  const index = new WorkspaceTypeIndex();

  const first = index.compilerOptions("w1", files);
  const typed = index.compilerOptions("w1", {
    ...files,
    "src/app.tsx": "const typed = 1;",
  });
  const nextApp = index.compilerOptions("w1", {
    ...files,
    "app/page.tsx": "export default function Page() {}",
  });

  assert.equal(typed, first);
  assert.notEqual(nextApp, first);
  assert.match(nextApp, /"@\/\*"/);
});
