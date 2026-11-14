import test from "node:test";
import assert from "node:assert/strict";
import { workspaceCompilerOptions } from "./workspace-compiler.ts";

test("maps explicit aliases relative to baseUrl and clears old workspace paths", () => {
  const files = {
    "tsconfig.json": `{"compilerOptions": {"baseUrl": "./src", "paths": {"@/*": ["./*"], "shared": ["../shared/index.ts"], "invalid": false}}}`,
  };

  const options = workspaceCompilerOptions("one", files);
  const plain = workspaceCompilerOptions("two", {});

  assert.deepEqual(options, {
    baseUrl: "file:///papert/one/src",
    paths: {
      "@/*": ["file:///papert/one/src/*"],
      shared: ["file:///papert/one/shared/index.ts"],
    },
  });
  assert.deepEqual(plain, { baseUrl: "file:///papert/two/", paths: {} });
});

test("supports jsconfig and keeps explicitly configured aliases over Next defaults", () => {
  const files = {
    "app/page.tsx": "",
    "jsconfig.json": '{"compilerOptions": {"paths": {"~/*": ["lib/*"]}}}',
  };

  const options = workspaceCompilerOptions("one", files);

  assert.deepEqual(options.paths, { "~/*": ["file:///papert/one/lib/*"] });
});

test("defaults Next aliases to src when present and otherwise the root", () => {
  const withSource = workspaceCompilerOptions("one", {
    "src/app/page.tsx": "",
  });
  const atRoot = workspaceCompilerOptions("one", {
    "package.json": '{"dependencies": {"next": "*"}}',
  });
  const explicitBase = workspaceCompilerOptions("one", {
    "app/page.tsx": "",
    "tsconfig.json": '{"compilerOptions": {"baseUrl": "."}}',
  });

  assert.deepEqual(withSource.paths, { "@/*": ["file:///papert/one/src/*"] });
  assert.deepEqual(atRoot.paths, { "@/*": ["file:///papert/one/*"] });
  assert.deepEqual(explicitBase.paths, {});
});
