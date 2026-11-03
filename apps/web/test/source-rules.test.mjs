import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_SOURCE_BYTES,
  rejectionReason,
} from "../app/study/sources/source-rules.ts";

test("accepts the four source formats regardless of extension case", () => {
  const names = ["guide.pdf", "legacy.DOC", "paper.docx", "notes.Md"];

  const reasons = names.map((name) => rejectionReason({ name, size: 10 }));

  assert.deepEqual(reasons, [null, null, null, null]);
});

test("rejects other types, empty files and files over 15 MB before upload", () => {
  const image = rejectionReason({ name: "photo.png", size: 10 });
  const empty = rejectionReason({ name: "notes.md", size: 0 });
  const large = rejectionReason({
    name: "book.pdf",
    size: MAX_SOURCE_BYTES + 1,
  });

  assert.equal(image, "Upload a PDF, DOC, DOCX or MD file.");
  assert.equal(empty, "The file is empty.");
  assert.equal(large, "Files must be 15 MB or smaller.");
});
