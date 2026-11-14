import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getTreeEntries } from "../tree/tree-model.ts";
import {
  creationPosition,
  isLastSibling,
  moveChange,
  selectionAfterRemove,
} from "./tree-editor-positions.ts";

const nodes = [
  {
    id: "src",
    label: "src",
    children: [
      { id: "a", label: "a.ts" },
      { id: "b", label: "b.ts" },
      { id: "c", label: "c.ts" },
    ],
  },
  { id: "readme", label: "README.md" },
  { id: "locked", label: "LICENSE", disabled: true },
];
const entries = getTreeEntries(nodes);

test("new items go beside their anchor or last inside their parent", () => {
  const below = creationPosition(nodes, entries, {
    type: "create",
    parentId: null,
    label: "",
    anchor: { id: "b", position: "after" },
  });
  const inside = creationPosition(nodes, entries, {
    type: "create",
    parentId: "src",
    label: "",
  });

  assert.deepEqual(below, { parentId: "src", index: 2 });
  assert.deepEqual(inside, { parentId: "src", index: 3 });
});

test("creating beside a missing or disabled item is refused", () => {
  const missing = {
    type: "create",
    parentId: null,
    label: "",
    anchor: { id: "gone", position: "before" },
  };
  const disabled = {
    type: "create",
    parentId: null,
    label: "",
    anchor: { id: "locked", position: "before" },
  };

  assert.throws(
    () => creationPosition(nodes, entries, missing),
    /no longer exists/,
  );
  assert.throws(() => creationPosition(nodes, entries, disabled), /disabled/);
});

test("moving down within the same parent accounts for the item leaving its place", () => {
  const change = moveChange(nodes, entries, "a", "c", "after");

  assert.deepEqual(change, {
    type: "move",
    id: "a",
    parentId: "src",
    index: 2,
  });
});

test("moving to the root or inside an item appends it", () => {
  const toRoot = moveChange(nodes, entries, "b", null, "inside");
  const intoFolder = moveChange(nodes, entries, "readme", "src", "inside");

  assert.deepEqual(toRoot, { type: "move", id: "b", parentId: null, index: 3 });
  assert.deepEqual(intoFolder, {
    type: "move",
    id: "readme",
    parentId: "src",
    index: 3,
  });
  assert.equal(moveChange(nodes, entries, "gone", "src", "inside"), null);
});

test("deleting selects the next sibling, else the previous one, else the parent", () => {
  const onlyChild = [
    { id: "dir", label: "dir", children: [{ id: "x", label: "x" }] },
  ];

  assert.equal(selectionAfterRemove(nodes, entries, "b"), "c");
  assert.equal(selectionAfterRemove(nodes, entries, "c"), "b");
  assert.equal(
    selectionAfterRemove(onlyChild, getTreeEntries(onlyChild), "x"),
    "dir",
  );
});

test("only the last sibling cannot move further down", () => {
  assert.equal(isLastSibling(nodes, entries, entries.get("c")), true);
  assert.equal(isLastSibling(nodes, entries, entries.get("a")), false);
});
