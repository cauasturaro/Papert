import assert from "node:assert/strict";
import { test } from "node:test";
import { tabTitles } from "./editor-tab-titles.ts";

test("disambiguates duplicate filenames with full folders and a root label", () => {
  const tabs = ["index.ts", "src/index.ts", "src/api/index.ts", "unique.ts"];

  const titles = tabTitles(tabs);

  assert.deepEqual(titles.get("index.ts"), { name: "index.ts", folder: "/" });
  assert.deepEqual(titles.get("src/index.ts"), { name: "index.ts", folder: "src" });
  assert.deepEqual(titles.get("src/api/index.ts"), { name: "index.ts", folder: "src/api" });
  assert.deepEqual(titles.get("unique.ts"), { name: "unique.ts", folder: null });
});
