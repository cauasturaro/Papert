import assert from "node:assert/strict";
import test from "node:test";
import { citedBlocks, covers, preview, targetOf } from "./citations.ts";

test("citation locations map to viewer targets", () => {
  const page = targetOf({ page: 3 });
  const lines = targetOf({ lineStart: 4, lineEnd: 9, headings: ["Setup"] });
  const paragraphs = targetOf({ paragraphStart: 2, paragraphEnd: 2 });

  assert.deepEqual(page, { kind: "page", page: 3 });
  assert.deepEqual(lines, { kind: "lines", start: 4, end: 9 });
  assert.deepEqual(paragraphs, { kind: "paragraphs", start: 2, end: 2 });
});

test("only blocks inside the cited range are highlighted", () => {
  const lines = { kind: "lines", start: 4, end: 9 };

  assert.equal(covers(lines, "lines", 4), true);
  assert.equal(covers(lines, "lines", 10), false);
  assert.equal(covers(lines, "paragraphs", 5), false);
  assert.equal(covers(null, "lines", 5), false);
});

test("previews keep the first lines of a passage", () => {
  assert.equal(preview("a\nb\nc", 2), "a\nb\n…");
  assert.equal(preview("a\nb", 2), "a\nb");
});

test("a quote narrows the highlight inside the cited range", () => {
  const target = { kind: "lines", start: 1, end: 4 };
  const blocks = [
    { number: 1, text: "# Notes" },
    { number: 2, text: '{ "leaseTag": "QUARTZ" }' },
    { number: 3, text: "}" },
    { number: 5, text: '{ "leaseTag": "QUARTZ" }' },
  ];

  const quoted = citedBlocks(
    target,
    "lines",
    blocks,
    '{\n  "leaseTag": "QUARTZ" }\n}',
  );
  const whole = citedBlocks(target, "lines", blocks, "");

  assert.deepEqual([...quoted], [2, 3]);
  assert.deepEqual([...whole], [1, 2, 3]);
});
