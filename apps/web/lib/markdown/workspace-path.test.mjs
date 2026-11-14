import assert from "node:assert/strict";
import test from "node:test";
import { workspacePath } from "./workspace-path.ts";

test("workspace paths are told apart from code", () => {
  assert.equal(workspacePath("src/app.ts"), "src/app.ts");
  assert.equal(workspacePath("./index.html"), "index.html");
  assert.equal(workspacePath("src/components/"), "src/components");
  assert.equal(workspacePath("styles.css"), "styles.css");

  assert.equal(workspacePath("console.log"), null);
  assert.equal(workspacePath("a + b"), null);
  assert.equal(workspacePath("https://example.com/a.js"), null);
  assert.equal(workspacePath("/etc/passwd"), null);
  assert.equal(workspacePath("fn()"), null);
});

