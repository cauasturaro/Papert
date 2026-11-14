import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  bundlePacks,
  hashedPackFile,
  packageDirectory,
  typeEntries,
  splitLargePacks,
  validatePacks,
} from "./prepare-type-packs.mjs";

const modulesRoot = fileURLToPath(
  new URL("../type-packs/node_modules", import.meta.url),
);

function fixtureFile(name, file = "index.d.ts") {
  return path.join(modulesRoot, name, file);
}

test("type entries follow nested import and require conditions", () => {
  const exports = {
    ".": {
      import: { types: "./index.d.mts" },
      require: { types: "./index.d.cts" },
    },
    "./extra": { types: "./extra.d.ts" },
    "./*": { types: "./*.d.ts" },
  };

  const entries = typeEntries(exports);

  assert.deepEqual(entries, [
    "./index.d.mts",
    "./index.d.cts",
    "./extra.d.ts",
    "./*.d.ts",
  ]);
});

test("package boundaries preserve scoped and nested dependencies", () => {
  const scoped = fixtureFile("@scope/example", "dist/index.d.ts");
  const nested = fixtureFile(
    "example",
    "node_modules/@scope/nested/index.d.ts",
  );

  assert.equal(packageDirectory(scoped), fixtureFile("@scope/example", ""));
  assert.equal(
    packageDirectory(nested),
    fixtureFile("example/node_modules/@scope/nested", ""),
  );
});

test("shared packages are emitted once and both consumers require them", () => {
  const shared = fixtureFile("shared");
  const definitions = {
    first: { packages: ["first"] },
    second: { packages: ["second"] },
  };
  const collected = new Map([
    [
      "first",
      new Map([
        [fixtureFile("first"), "export {};"],
        [shared, "export {};"],
      ]),
    ],
    [
      "second",
      new Map([
        [fixtureFile("second"), "export {};"],
        [shared, "export {};"],
      ]),
    ],
  ]);

  const result = bundlePacks(definitions, collected);
  validatePacks(result);

  assert.deepEqual(result.manifest.packs.first.requires, ["shared-shared"]);
  assert.deepEqual(result.manifest.packs.second.requires, ["shared-shared"]);
  assert.equal(Object.keys(result.output["shared-shared"].files).length, 1);
});

test("large packs split without duplicating declarations or losing dependencies", () => {
  const result = {
    manifest: {
      version: 1,
      packs: {
        example: { file: "example.json", triggers: ["example"], requires: [] },
      },
    },
    output: {
      example: {
        id: "example",
        files: {
          "file:///node_modules/example/first.d.ts": "export {};",
          "file:///node_modules/example/second.d.ts": "export {};",
        },
      },
    },
  };

  splitLargePacks(result, 80);
  validatePacks(result);

  assert.deepEqual(result.manifest.packs.example.requires, ["example-1"]);
  assert.equal(Object.keys(result.output.example.files).length, 1);
  assert.equal(Object.keys(result.output["example-1"].files).length, 1);
});

test("validation rejects duplicate URIs and cyclic dependencies", () => {
  const uri = "file:///node_modules/example/index.d.ts";
  const result = {
    manifest: {
      version: 1,
      packs: {
        first: { file: "first.json", triggers: [], requires: [] },
        second: { file: "second.json", triggers: [], requires: [] },
      },
    },
    output: {
      first: { id: "first", files: { [uri]: "" } },
      second: { id: "second", files: { [uri]: "" } },
    },
  };

  assert.throws(() => validatePacks(result), /Duplicate URI/);

  result.output.second.files = {};
  result.manifest.packs.first.requires = ["second"];
  result.manifest.packs.second.requires = ["first"];

  assert.throws(() => validatePacks(result), /Cyclic pack dependency/);
});

test("pack file names change with their content", () => {
  const first = hashedPackFile("react", '{"id":"react","files":{}}');
  const same = hashedPackFile("react", '{"id":"react","files":{}}');
  const changed = hashedPackFile("react", '{"id":"react","files":{"a":"b"}}');

  assert.match(first, /^react-[0-9a-f]{16}\.json$/);
  assert.equal(first, same);
  assert.notEqual(first, changed);
});
