import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  parseInline,
  parseMarkdown,
  safeHref,
} from "./parse.ts";

const text = (value) => ({ type: "text", value });

test("paragraphs, headings, rules and soft line breaks", () => {
  const blocks = parseMarkdown(
    "# Title\n\nFirst line\nsecond line\n\n---\nAfter",
  );

  assert.deepEqual(blocks, [
    { type: "heading", level: 1, children: [text("Title")] },
    {
      type: "paragraph",
      children: [text("First line"), { type: "break" }, text("second line")],
    },
    { type: "rule" },
    { type: "paragraph", children: [text("After")] },
  ]);
});

test("inline emphasis, code and links", () => {
  const inline = parseInline(
    "Use **bold**, *it*, `x = 1` and [docs](https://example.com/a).",
  );

  assert.deepEqual(inline, [
    text("Use "),
    { type: "strong", children: [text("bold")] },
    text(", "),
    { type: "emphasis", children: [text("it")] },
    text(", "),
    { type: "code", value: "x = 1" },
    text(" and "),
    { type: "link", href: "https://example.com/a", children: [text("docs")] },
    text("."),
  ]);
});

test("unsafe or partial links stay text", () => {
  const unsafe = parseInline("[click](javascript:alert(1))");
  const partial = parseInline("see [the guide](https://exa");
  const snake = parseInline("my_var_name and 2*3*4");

  assert.deepEqual(unsafe, [text("click)")]);
  assert.equal(
    partial.some((node) => node.type === "link"),
    false,
  );
  assert.deepEqual(snake, [text("my_var_name and 2*3*4")]);
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("http://example.com"), "http://example.com/");
});

test("bare URLs become links without trailing punctuation", () => {
  const inline = parseInline("Read https://developer.mozilla.org/docs.");

  assert.deepEqual(inline, [
    text("Read "),
    {
      type: "link",
      href: "https://developer.mozilla.org/docs",
      children: [text("https://developer.mozilla.org/docs")],
    },
    text("."),
  ]);
});

test("fenced code keeps its language, and an open fence stays open", () => {
  const closed = parseMarkdown(
    "```JS\nconst a = 1;\n  indented();\n```\nAfter",
  );
  const streaming = parseMarkdown("Here:\n```python\nprint(1)");

  assert.deepEqual(closed[0], {
    type: "code",
    language: "js",
    code: "const a = 1;\n  indented();",
    complete: true,
  });
  assert.equal(closed[1].type, "paragraph");
  assert.deepEqual(streaming[1], {
    type: "code",
    language: "python",
    code: "print(1)",
    complete: false,
  });
});

test("lists nest and keep their numbering", () => {
  const blocks = parseMarkdown(
    "3. First\n4. Second\n   - inner a\n   - inner b\n5. Third\n\nDone",
  );
  const list = blocks[0];

  assert.equal(list.type, "list");
  assert.equal(list.ordered, true);
  assert.equal(list.start, 3);
  assert.equal(list.items.length, 3);

  const nested = list.items[1][1];

  assert.equal(nested.type, "list");
  assert.equal(nested.ordered, false);
  assert.equal(nested.items.length, 2);
  assert.deepEqual(blocks[1], { type: "paragraph", children: [text("Done")] });
});

test("loose lists, code inside items and quotes", () => {
  const loose = parseMarkdown("- a\n\n- b\n\n  ```ts\n  let x;\n  ```");
  const quote = parseMarkdown("> **Note**\n> keep going");

  assert.equal(loose.length, 1);
  assert.equal(loose[0].items.length, 2);
  assert.deepEqual(loose[0].items[1][1], {
    type: "code",
    language: "ts",
    code: "let x;",
    complete: true,
  });

  assert.equal(quote[0].type, "blockquote");
  assert.equal(quote[0].children[0].type, "paragraph");
});

test("simple tables with alignment", () => {
  const [table] = parseMarkdown(
    "| Name | Size |\n|:-----|-----:|\n| a.ts | 1 |\n| b | 2 |",
  );

  assert.equal(table.type, "table");
  assert.deepEqual(table.align, ["left", "right"]);
  assert.deepEqual(table.header, [[text("Name")], [text("Size")]]);
  assert.equal(table.rows.length, 2);
});


test("never throws on odd input", () => {
  for (const input of [
    "",
    "*",
    "**",
    "`",
    "```",
    "[",
    "](",
    "- ",
    "|",
    "> ",
    "#",
    "1.",
    "\\",
  ]) {
    assert.doesNotThrow(() => parseMarkdown(input));
  }
});
