import test from "node:test";
import assert from "node:assert/strict";
import {
  insertMention,
  matchingTargets,
  mentionAt,
  mentionedTargets,
  openMention,
} from "./mentions.ts";

const sources = [
  { id: "a", filename: "Usadosbr API Integration.pdf" },
  { id: "b", filename: "notes.md" },
];

test("detects the @query before the caret only at a word start", () => {
  const typing = mentionAt("example from @usa", 17);
  const email = mentionAt("mail me@usa", 11);
  const finished = mentionAt("see @notes.md\n", 14);

  assert.deepEqual(typing, { start: 13, query: "usa" });
  assert.equal(email, null);
  assert.equal(finished, null);
});

test("filters sources case-insensitively and inserts the full file name", () => {
  const text = "example from @usa please";
  const mention = mentionAt(text, 17);

  const matches = matchingTargets(sources, mention.query);
  const inserted = insertMention(text, mention, 17, matches[0].filename);

  assert.deepEqual(
    matches.map((source) => source.id),
    ["a"],
  );
  assert.equal(
    inserted.text,
    "example from @Usadosbr API Integration.pdf  please",
  );
  assert.equal(inserted.caret, 43);
});

test("only sources still written in the prompt count as mentioned", () => {
  const both = mentionedTargets(
    "@notes.md vs @Usadosbr API Integration.pdf",
    sources,
  );
  const removed = mentionedTargets("compare with notes", sources);

  assert.deepEqual(
    both.map((source) => source.id),
    ["a", "b"],
  );
  assert.deepEqual(removed, []);
});

test("a completed mention does not reopen the menu", () => {
  const text = "According to @notes.md ";

  const afterInsert = openMention(text, text.length, sources);
  const typing = openMention("According to @not", 17, sources);

  assert.equal(afterInsert, null);
  assert.deepEqual(typing, { start: 13, query: "not" });
});
