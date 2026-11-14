export type TreeEditorLabels = {
  addRoot: string;
  addChild: string;
  addAbove: string;
  addBelow: string;
  actions: string;
  rename: string;
  remove: string;
  move: string;
  moveUp: string;
  moveDown: string;
  moveRoot: string;
  before: string;
  inside: string;
  after: string;
  save: string;
  cancel: string;
  name: string;
  createTitle: string;
  removeTitle: string;
  moveTitle: string;
  removeDescription: (label: string, count: number) => string;
  moveDescription: string;
  added: string;
  renamed: string;
  removed: string;
  moved: string;
  requiredName: string;
  drag: (label: string) => string;
};
export const defaultLabels: TreeEditorLabels = {
  addRoot: "Add at root",
  addChild: "Add inside",
  addAbove: "Add above",
  addBelow: "Add below",
  actions: "Item actions",
  rename: "Rename",
  remove: "Delete",
  move: "Move to…",
  moveUp: "Move up",
  moveDown: "Move down",
  moveRoot: "Move to root",
  before: "Before destination",
  inside: "Inside destination",
  after: "After destination",
  save: "Save",
  cancel: "Cancel",
  name: "Item name",
  createTitle: "New item",
  removeTitle: "Delete item?",
  moveTitle: "Move item",
  removeDescription: (label, count) =>
    `Delete “${label}”${count ? ` and its ${count} descendants` : ""}? This removes the whole subtree.`,
  moveDescription:
    "Select a destination and choose the position. You can also move the item to the root.",
  added: "Item added.",
  renamed: "Item renamed.",
  removed: "Item deleted.",
  moved: "Item moved.",
  requiredName: "Enter a name.",
  drag: (label) =>
    `Drag ${label}. Use the actions menu to move it with the keyboard.`,
};
