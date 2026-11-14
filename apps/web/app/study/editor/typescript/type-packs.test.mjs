import test from "node:test";
import assert from "node:assert/strict";
import {
  packageRoot,
  workspacePackages,
  resolvePacks,
  ignoredDiagnostics,
  parseManifest,
} from "./type-packs.ts";
import { loadTypePacks } from "./type-pack-loader.ts";

const manifest = {
  version: 1,
  packs: {
    node: { file: "node.json", triggers: ["node"], requires: [] },
    react: { file: "react.json", triggers: ["react"], requires: [] },
    next: {
      file: "next.json",
      triggers: ["next"],
      requires: ["react", "node"],
    },
    nestjs: {
      file: "nestjs.json",
      triggers: ["@nestjs/common"],
      requires: ["node"],
    },
    unavailable: {
      file: "unavailable.json",
      triggers: ["unavailable"],
      requires: [],
    },
  },
};

test("normalizes scoped packages, subpaths and Node builtins", () => {
  assert.equal(packageRoot("@nestjs/common/x"), "@nestjs/common");
  assert.equal(packageRoot("next/navigation"), "next");
  assert.equal(packageRoot("node:fs/promises"), "node");
  assert.equal(packageRoot("fs/promises"), "node");
  assert.equal(packageRoot("path"), "node");
  assert.equal(packageRoot("./local"), null);
  assert.equal(packageRoot("https://example.com/mod.js"), null);
  assert.equal(packageRoot("#internal"), null);
});

test("detects dependencies and TS/JS imports independently of ordinary edits", () => {
  const files = {
    "package.json": JSON.stringify({
      dependencies: { next: "*" },
      devDependencies: { typescript: "*" },
      peerDependencies: { react: "*" },
    }),
    "main.ts": `import { Body } from '@nestjs/common';
      import 'reflect-metadata';
      export { readFile } from 'node:fs';
      const express = require('express');
      const router = import('next/navigation');
      import './local';`,
    "other.cjs": "require('path');",
    "notes.md": "import 'ignored';",
  };

  const packages = workspacePackages(files);
  const edited = workspacePackages({
    ...files,
    "main.ts": `${files["main.ts"]}\nconst value = 1;`,
  });

  assert.deepEqual(packages, [
    "@nestjs/common",
    "express",
    "next",
    "node",
    "react",
    "reflect-metadata",
    "typescript",
  ]);
  assert.deepEqual(edited, packages);
});

test("loads the transitive closure once, dependencies first, and tolerates cycles", () => {
  const cyclic = {
    version: 1,
    packs: {
      a: { file: "a.json", triggers: ["a"], requires: ["b", "missing"] },
      b: { file: "b.json", triggers: [], requires: ["a"] },
    },
  };

  assert.deepEqual(resolvePacks(manifest, ["next", "@nestjs/common"]), [
    "react",
    "node",
    "next",
    "nestjs",
  ]);
  assert.deepEqual(resolvePacks(cyclic, ["a"]), ["b", "a"]);
});

test("enables only diagnostics covered by loaded packs", () => {
  const plain = ignoredDiagnostics(new Set());
  const node = ignoredDiagnostics(new Set(["node"]));
  const react = ignoredDiagnostics(new Set(["react"]));
  const all = ignoredDiagnostics(new Set(["node", "react"]));

  assert.ok(
    [2580, 2591, 2875, 7026, 2503].every((code) => plain.includes(code)),
  );
  assert.ok(!node.includes(2580) && !node.includes(2591));
  assert.ok(node.includes(7026));
  assert.ok(!react.includes(2875) && !react.includes(7026));
  assert.ok(react.includes(2580));
  assert.deepEqual(all, [2307, 2792, 7016, 2503]);
});

test("caches fetches and registers declaration and package files once in both defaults", async (t) => {
  const requests = [];
  const registrations = [[], []];
  const diagnostics = [];
  const defaults = registrations.map((entries) => ({
    addExtraLib(content, uri) {
      entries.push({ content, uri });
      return { dispose() {} };
    },
    setDiagnosticsOptions(options) {
      diagnostics.push(options);
    },
  }));
  const monaco = {
    typescript: {
      typescriptDefaults: defaults[0],
      javascriptDefaults: defaults[1],
    },
  };
  t.mock.method(globalThis, "fetch", async (path) => {
    requests.push(path);
    if (path.endsWith("unavailable.json")) {
      throw new Error("Offline");
    }

    const id = path.split("/").pop().replace(".json", "");
    const body =
      id === "manifest"
        ? manifest
        : {
            id,
            files: {
              [`file:///node_modules/${id}/package.json`]:
                '{"types":"index.d.ts"}',
              [`file:///node_modules/${id}/index.d.ts`]:
                "export const value: number;",
            },
          };

    return { ok: true, json: async () => body };
  });

  await Promise.all([
    loadTypePacks(monaco, ["next"]),
    loadTypePacks(monaco, ["next"]),
  ]);
  await loadTypePacks(monaco, ["next", "unavailable"]);
  await loadTypePacks(monaco, ["unavailable"]);

  assert.deepEqual(requests, [
    "/type-packs/manifest.json",
    "/type-packs/react.json",
    "/type-packs/node.json",
    "/type-packs/next.json",
    "/type-packs/unavailable.json",
  ]);
  assert.equal(registrations[0].length, 6);
  assert.deepEqual(registrations[0], registrations[1]);
  assert.deepEqual(
    diagnostics.at(-1).diagnosticCodesToIgnore,
    [2307, 2792, 7016, 2503],
  );
});

test("Monaco resolves a package types entry from package.json in extra libraries", async () => {
  const { TypeScriptWorker } =
    await import("monaco-editor/languages/features/typescript/tsWorker.js");
  const source =
    'import { value } from "fixture"; const result: string = value;';
  const uri = "file:///papert/fixture/main.ts";
  const worker = new TypeScriptWorker(
    {
      getMirrorModels: () => [
        {
          uri: { path: "/papert/fixture/main.ts", toString: () => uri },
          version: 1,
          getValue: () => source,
        },
      ],
    },
    {
      compilerOptions: { moduleResolution: 2, noEmit: true, strict: true },
      extraLibs: {
        "file:///node_modules/fixture/package.json": {
          content: '{"types":"dist/types.d.ts"}',
          version: 1,
        },
        "file:///node_modules/fixture/dist/types.d.ts": {
          content: "export const value: number;",
          version: 1,
        },
      },
    },
  );

  const diagnostics = await worker.getSemanticDiagnostics(uri);

  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === 2322));
  assert.ok(!diagnostics.some((diagnostic) => diagnostic.code === 2307));
});

test("keeps the editor working when the manifest cannot be fetched", async (t) => {
  const { loadTypePacks: loadOffline } =
    await import("./type-pack-loader.ts?offline");
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => {
    requests += 1;
    throw new Error("Offline");
  });

  await loadOffline({}, ["next"]);
  await loadOffline({}, ["react"]);

  assert.equal(requests, 1);
});

test("parseManifest drops malformed packs and rejects unknown versions", () => {
  const raw = {
    version: 1,
    packs: {
      express: { file: "express.json", triggers: ["express"], requires: [] },
      broken: { file: "broken.json", triggers: "express", requires: [] },
    },
  };

  const parsed = parseManifest(raw);
  const unsupported = parseManifest({ ...raw, version: 2 });

  assert.deepEqual(Object.keys(parsed.packs), ["express"]);
  assert.equal(unsupported, null);
});
