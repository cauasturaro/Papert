import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseMonacoAssets, workerFile } from "./monaco-assets.ts";

const manifest = {
  editor: "editor-b55b5c3347133b0e.js",
  workers: {
    editor: "editor.worker-92ab943732ef95ba.js",
    ts: "ts.worker-0fa5dae1f3086c5b.js",
    json: "json.worker-59f086c586206417.js",
  },
};

test("maps Monaco's language labels to the hashed worker files", () => {
  const assets = parseMonacoAssets(manifest);

  assert.equal(workerFile(assets, "typescript"), manifest.workers.ts);
  assert.equal(workerFile(assets, "javascript"), manifest.workers.ts);
  assert.equal(workerFile(assets, "json"), manifest.workers.json);
  assert.equal(workerFile(assets, "python"), manifest.workers.editor);
});

test("rejects manifests that do not name hashed files", () => {
  const unhashed = { ...manifest, editor: "editor.js" };
  const traversal = { ...manifest, editor: "../editor-b55b5c3347133b0e.js" };

  assert.equal(parseMonacoAssets(unhashed), null);
  assert.equal(parseMonacoAssets(traversal), null);
  assert.equal(parseMonacoAssets(null), null);
});
