import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

rmSync("public/monaco", { recursive: true, force: true });

const options = {
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  loader: { ".ttf": "file" },
  outdir: "public/monaco",
  plugins: [
    {
      name: "patched-dompurify",
      setup(builder) {
        // Monaco also vendors DOMPurify; route that import to the patched dependency.
        builder.onResolve({ filter: /dompurify\/dompurify\.js$/ }, () => ({
          path: fileURLToPath(import.meta.resolve("dompurify")),
        }));
      },
    },
  ],
};

// Bundle source so the patched DOMPurify override also reaches the browser assets.
const editorBuild = await build({
  ...options,
  metafile: true,
  stdin: {
    contents: `import * as monaco from "monaco-editor/editor/editor.main.js";
      window.papertMonaco = monaco;`,
    resolveDir: process.cwd(),
    sourcefile: "editor.js",
  },
  entryNames: "editor",
});

const inputs = Object.keys(editorBuild.metafile.inputs);
assert(
  inputs.some((path) => /node_modules\/dompurify\/dist\//.test(path)),
  "Bundle the patched DOMPurify dependency.",
);
assert(
  !inputs.some((path) => path.endsWith("/browser/dompurify/dompurify.js")),
  "Do not bundle Monaco's vendored DOMPurify.",
);

await build({
  ...options,
  entryPoints: {
    "editor.worker": "monaco-editor/editor/editor.worker.js",
    "ts.worker": "monaco-editor/language/typescript/ts.worker.js",
    "json.worker": "monaco-editor/language/json/json.worker.js",
  },
});

// Content-hashed names let the scripts be cached as immutable; the manifest keeps the
// fixed name the editor looks up. The stylesheet is bundled by Next and keeps its name.
function hashedName(name) {
  const file = `public/monaco/${name}.js`;
  const hash = createHash("sha256")
    .update(readFileSync(file))
    .digest("hex")
    .slice(0, 16);
  const hashed = `${name}-${hash}.js`;

  renameSync(file, `public/monaco/${hashed}`);

  return hashed;
}

const manifest = {
  editor: hashedName("editor"),
  workers: {
    editor: hashedName("editor.worker"),
    ts: hashedName("ts.worker"),
    json: hashedName("json.worker"),
  },
};

writeFileSync("public/monaco/manifest.json", JSON.stringify(manifest));
