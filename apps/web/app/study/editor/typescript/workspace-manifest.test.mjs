import test from "node:test";
import assert from "node:assert/strict";
import { parseJsonc } from "./workspace-manifest.ts";

test("parses JSONC without changing comment markers or commas inside strings", () => {
  const content = `{
    // Configuration
    "url": "https://example.com/a/*b*/",
    "escaped": "a\\\"//b",
    "literal": ",}", /* comment */
    "values": ["x",],
  }`;

  const parsed = parseJsonc(content);

  assert.equal(parsed.url, "https://example.com/a/*b*/");
  assert.equal(parsed.escaped, 'a"//b');
  assert.equal(parsed.literal, ",}");
  assert.deepEqual(parsed.values, ["x"]);
  assert.deepEqual(parseJsonc("broken"), {});
  assert.deepEqual(parseJsonc("null"), {});
});
