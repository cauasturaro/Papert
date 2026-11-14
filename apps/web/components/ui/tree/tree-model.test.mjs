import assert from "node:assert/strict";
import test from "node:test";
import { applyTreeChange, getTreeCheckStates, getTreeEntries, validateTree } from "./tree-model.ts";
import { getVisibleTree } from "./tree-visible.ts";

const nodes = [
  { id: "parent", label: "Parent", children: [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
  ] },
  { id: "other", label: "Other" },
];

test("validation rejects duplicate IDs, empty names and cycles", () => {
  const cycle = { id: "cycle", label: "Cycle", children: [] };
  cycle.children.push(cycle);

  assert.match(validateTree([...nodes, nodes[0]]), /unique/);
  assert.match(validateTree([{ id: "empty", label: " " }]), /name/);
  assert.match(validateTree([cycle]), /cycle/);
  assert.equal(validateTree(nodes), null);
});

test("rejected mutations leave the original tree intact", () => {
  const original = structuredClone(nodes);
  const changes = [
    { type: "remove", id: "missing" },
    { type: "rename", id: "a", label: " " },
    { type: "move", id: "parent", parentId: "a", index: 0 },
    { type: "move", id: "a", parentId: "missing", index: 0 },
    { type: "move", id: "a", parentId: null, index: 3 },
    { type: "create", parentId: null, index: 0, node: nodes[0] },
  ];

  for (const change of changes) {
    assert.throws(() => applyTreeChange(nodes, change));
  }

  assert.deepEqual(nodes, original);
});

test("same-parent moves use the index after removal and keep untouched branches", () => {
  const result = applyTreeChange(nodes, { type: "move", id: "a", parentId: "parent", index: 1 });

  assert.deepEqual(result[0].children.map((node) => node.id), ["b", "a"]);
  assert.equal(result[0].children[1], nodes[0].children[0]);
  assert.equal(result[1], nodes[1]);
});

test("renaming preserves unchanged branch identity", () => {
  const result = applyTreeChange(nodes, { type: "rename", id: "a", label: " Renamed " });

  assert.equal(result[0].children[0].label, "Renamed");
  assert.equal(result[0].children[1], nodes[0].children[1]);
  assert.equal(result[1], nodes[1]);
});

test("disabled descendants block subtree moves and removals", () => {
  const locked = [{ id: "p", label: "Parent", children: [{ id: "c", label: "Child", disabled: true }] }];

  assert.throws(() => applyTreeChange(locked, { type: "remove", id: "p" }), /disabled/);
  assert.throws(() => applyTreeChange(locked, { type: "move", id: "p", parentId: null, index: 0 }), /disabled/);
  assert.throws(() => applyTreeChange(locked, { type: "rename", id: "c", label: "Name" }), /disabled/);
  assert.equal(getTreeEntries([{ ...locked[0], disabled: true }]).get("c").disabled, true);
});

test("checkboxes propagate mixed state and exclude disabled descendants", () => {
  const mixed = getTreeCheckStates(nodes, ["a"]);
  const checked = getTreeCheckStates(nodes, ["a", "b"]);
  const locked = getTreeCheckStates([{ ...nodes[0], disabled: true }], ["a", "b"]);
  const excluded = getTreeCheckStates([{ ...nodes[0], children: [nodes[0].children[0], { ...nodes[0].children[1], disabled: true }] }], ["a"]);

  assert.deepEqual(mixed.get("parent"), { checked: false, mixed: true });
  assert.deepEqual(checked.get("parent"), { checked: true, mixed: false });
  assert.deepEqual(locked.get("a"), { checked: false, mixed: false });
  assert.deepEqual(excluded.get("parent"), { checked: true, mixed: false });
});

test("visible traversal follows expansion and includes matching ancestors", () => {
  const collapsed = getVisibleTree(nodes, new Set(), "");
  const expanded = getVisibleTree(nodes, new Set(["parent"]), "");
  const filtered = getVisibleTree(nodes, new Set(), "alpha");

  assert.deepEqual(collapsed.visible, ["parent", "other"]);
  assert.deepEqual(expanded.visible, ["parent", "a", "b", "other"]);
  assert.deepEqual(filtered.visible, ["parent", "a"]);
});
