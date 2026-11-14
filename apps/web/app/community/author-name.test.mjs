import { strict as assert } from "node:assert";
import { test } from "node:test";
import { authorNameProblem } from "./author-name.ts";

test("accepts names Core accepts", () => {
  assert.equal(authorNameProblem("Ada L."), null);
  assert.equal(authorNameProblem("José_dev-2"), null);
});

test("counts code points, not UTF-16 units", () => {
  assert.equal(authorNameProblem("😀"), "Use 2 to 40 characters.");
  assert.notEqual(authorNameProblem("𝒜".repeat(40)), "Use 2 to 40 characters.");
  assert.equal(authorNameProblem("a".repeat(41)), "Use 2 to 40 characters.");
});

test("rejects other characters and reserved names", () => {
  assert.match(authorNameProblem("ada!") ?? "", /only letters/);
  assert.match(authorNameProblem(" ada") ?? "", /only letters/);
  assert.match(authorNameProblem("Seymour fan") ?? "", /reserved/);
  assert.match(authorNameProblem("Pa.pert") ?? "", /reserved/);
});
