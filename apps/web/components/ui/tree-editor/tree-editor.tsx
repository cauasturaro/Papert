"use client";

import {
  useCallback,
  useId,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  DragDropProvider,
  DragOverlay,
  useDraggable,
  useDroppable,
} from "@dnd-kit/react";
import {
  Accessibility,
  Feedback,
  PointerSensor,
  PointerActivationConstraints,
} from "@dnd-kit/dom";
import { cn } from "@/lib/utils";
import { Button } from "../button/button";
import { Input } from "../input/input";
import { AlertDialog } from "../alert-dialog/alert-dialog";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from "../dialog/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../dropdown-menu/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
} from "../context-menu/context-menu";
import { Tree, type TreeProps } from "../tree/tree";
import {
  applyTreeChange,
  getTreeEntries,
  validateTree,
  type TreeNode,
  type TreeChange,
} from "../tree/tree-model";
import { TreeEditorSkeleton } from "./tree-editor-skeleton";

export type { TreeNode, TreeChange } from "../tree/tree-model";
export { applyTreeChange } from "../tree/tree-model";
export const treeEditorVariants = cva(
  "min-w-0 max-w-full space-y-3 [&_[data-tree-row]:has([data-tree-draggable])]:touch-none [&_[data-tree-row]:has([data-tree-draggable])]:cursor-grab [&_[data-tree-row]:has([data-tree-dragging])]:opacity-40",
  {
    variants: { size: { sm: "text-xs", md: "text-sm", lg: "text-base" } },
    defaultVariants: { size: "md" },
  },
);
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
const defaultLabels: TreeEditorLabels = {
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
export type TreeEditorProps<T = unknown> = Omit<
  ComponentProps<"div">,
  "children" | "onChange" | "defaultValue" | "dangerouslySetInnerHTML"
> &
  VariantProps<typeof treeEditorVariants> & {
    value?: readonly TreeNode<T>[];
    defaultValue?: readonly TreeNode<T>[];
    onChange?: (nodes: readonly TreeNode<T>[], change: TreeChange<T>) => void;
    canChange?: (
      change: TreeChange<T>,
      nodes: readonly TreeNode<T>[],
    ) => string | undefined;
    createNode?: (label: string) => TreeNode<T>;
    onChangeRejected?: (reason: string) => void;
    selectedId?: string | null;
    defaultSelectedId?: string | null;
    onSelectedChange?: (id: string | null) => void;
    expandedIds?: readonly string[];
    defaultExpandedIds?: readonly string[];
    onExpandedChange?: (ids: string[]) => void;
    filter?: boolean;
    showNodeActions?: boolean;
    enableContextMenu?: boolean;
    disabled?: boolean;
    readOnly?: boolean;
    pending?: boolean;
    skeleton?: boolean;
    label?: string;
    searchLabel?: string;
    emptyMessage?: string;
    labels?: Partial<TreeEditorLabels>;
    renderIcon?: TreeProps<T>["renderIcon"];
  };
type Edit =
  | { type: "rename"; id: string; label: string }
  | {
      type: "create";
      parentId: string | null;
      label: string;
      anchor?: { id: string; position: "before" | "after" };
    };
type DropPosition = "before" | "inside" | "after";
const sensors = [
  PointerSensor.configure({
    activationConstraints: [
      new PointerActivationConstraints.Distance({ value: 6 }),
    ],
  }),
];
const plugins: ComponentProps<typeof DragDropProvider>["plugins"] = (
  defaults,
) =>
  defaults
    .filter((plugin) => plugin !== Accessibility && plugin !== Feedback)
    .concat(Feedback.configure({ dropAnimation: null }));

export function TreeEditor<T>({
  skeleton = false,
  ...props
}: TreeEditorProps<T>) {
  if (skeleton)
    return (
      <TreeEditorSkeleton
        id={props.id}
        size={props.size}
        style={props.style}
        className={props.className}
      />
    );
  const error = validateTree(props.value ?? props.defaultValue ?? []);
  if (error) return <p role="alert">{error}</p>;
  return <TreeEditorControl {...props} />;
}
function TreeEditorControl<T>({
  value,
  defaultValue = [],
  onChange,
  canChange,
  createNode,
  onChangeRejected,
  selectedId,
  defaultSelectedId = null,
  onSelectedChange,
  expandedIds,
  defaultExpandedIds = [],
  onExpandedChange,
  filter = true,
  showNodeActions = false,
  enableContextMenu = false,
  disabled = false,
  readOnly = false,
  pending = false,
  size = "md",
  label = "Tree editor",
  searchLabel,
  emptyMessage,
  labels: labelOverrides,
  renderIcon,
  className,
  ...props
}: TreeEditorProps<T>) {
  const id = useId();
  const [localNodes, setNodes] = useState(defaultValue);
  const [localSelected, setSelected] = useState<string | null>(
    defaultSelectedId,
  );
  const [localExpanded, setExpanded] =
    useState<readonly string[]>(defaultExpandedIds);
  const [query, setQuery] = useState("");
  const [edit, setEdit] = useState<Edit | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);
  const [destination, setDestination] = useState<string | null>(null);
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const treeRef = useRef<HTMLDivElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const menuAction = useRef(false);
  const dragSnapshot = useRef<readonly TreeNode<T>[] | null>(null);
  const nodes = value ?? localNodes;
  const entries = getTreeEntries(nodes);
  const selected = selectedId === undefined ? localSelected : selectedId;
  const current = selected ? entries.get(selected) : undefined;
  const labels = { ...defaultLabels, ...labelOverrides };
  const locked = disabled || readOnly || pending;
  const expanded = expandedIds ?? localExpanded;
  const draggingDisabled = locked || !!query.trim() || !!edit;
  const removeNode = removeId ? entries.get(removeId)?.node : undefined;
  const draggedNode = activeDrag ? entries.get(activeDrag)?.node : undefined;
  const blockedTargets = new Set(
    draggedNode ? getTreeEntries([draggedNode]).keys() : [],
  );
  let draftId = `${id}-draft`;
  while (entries.has(draftId)) draftId += "-";
  let displayNodes = nodes;
  if (edit?.type === "create") {
    const draft: TreeNode<T> = {
      id: draftId,
      label: labels.createTitle || labels.name || "New item",
    };
    try {
      displayNodes = applyTreeChange(nodes, {
        type: "create",
        ...creationPosition(edit),
        node: draft,
      });
    } catch {
      // Keeps the draft cancelable if the destination changes while editing.
      displayNodes = [...nodes, draft];
    }
  }
  function choose(next: string | null) {
    if (selectedId === undefined) setSelected(next);
    onSelectedChange?.(next);
  }
  function expand(next: string[]) {
    if (expandedIds === undefined) setExpanded(next);
    onExpandedChange?.(next);
  }
  function reveal(parentId: string | null) {
    const next = new Set(expanded);
    let key = parentId;
    while (key !== null) {
      next.add(key);
      key = entries.get(key)?.parentId ?? null;
    }
    if (next.size !== expanded.length) expand([...next]);
  }
  function focusNode(key?: string | null) {
    requestAnimationFrame(() => {
      const target =
        [
          ...(treeRef.current?.querySelectorAll<HTMLElement>(
            "[data-tree-id]",
          ) ?? []),
        ].find((element) => element.dataset.treeId === key) ??
        treeRef.current?.querySelector<HTMLElement>(
          '[role="treeitem"][tabindex="0"]',
        ) ??
        treeRef.current?.querySelector<HTMLElement>("input");
      (target ?? addButtonRef.current)?.focus();
    });
  }
  function reject(reason: string) {
    setError(reason);
    onChangeRejected?.(reason);
  }
  function perform(change: TreeChange<T>): boolean {
    if (locked) return false;
    let next: readonly TreeNode<T>[];
    try {
      next = applyTreeChange(nodes, change);
      const reason = canChange?.(change, nodes);
      if (reason) {
        reject(reason);
        return false;
      }
    } catch (cause) {
      reject(
        cause instanceof Error ? cause.message : "Unable to change the tree.",
      );
      return false;
    }
    if (value === undefined) setNodes(next);
    onChange?.(next, change);
    setError("");
    setMessage(
      labels[
        change.type === "create"
          ? "added"
          : change.type === "rename"
            ? "renamed"
            : change.type === "remove"
              ? "removed"
              : "moved"
      ],
    );
    if (change.type === "create") {
      setQuery("");
      reveal(change.parentId);
      choose(change.node.id);
      focusNode(change.node.id);
    } else if (change.type === "remove") {
      const parent = entries.get(change.id)?.parentId;
      const siblings = parent ? entries.get(parent)!.node.children! : nodes;
      const index = entries.get(change.id)!.index;
      const nextId =
        siblings[index + 1]?.id ?? siblings[index - 1]?.id ?? parent ?? null;
      choose(nextId);
      focusNode(nextId);
      const surviving = getTreeEntries(next);
      expand(expanded.filter((key) => surviving.has(key)));
    } else {
      if (change.type === "rename") setQuery("");
      reveal(
        change.type === "move"
          ? change.parentId
          : entries.get(change.id)!.parentId,
      );
      choose(change.id);
      focusNode(change.id);
    }
    return true;
  }
  function creationPosition(draft: Extract<Edit, { type: "create" }>) {
    const anchor = draft.anchor ? entries.get(draft.anchor.id) : undefined;
    if (draft.anchor && !anchor)
      throw new Error("The reference item no longer exists.");
    if (anchor?.disabled) throw new Error("The reference item is disabled.");
    const parentId = anchor ? anchor.parentId : draft.parentId;
    const siblings =
      parentId === null ? nodes : (entries.get(parentId)?.node.children ?? []);
    return {
      parentId,
      index: anchor
        ? anchor.index + (draft.anchor?.position === "after" ? 1 : 0)
        : siblings.length,
    };
  }
  function saveEdit() {
    if (!edit || locked) return;
    if (!edit.label.trim()) {
      reject(labels.requiredName);
      return;
    }
    if (edit.type === "rename") {
      if (perform({ type: "rename", id: edit.id, label: edit.label }))
        setEdit(null);
    } else {
      let change: TreeChange<T>;
      try {
        const position = creationPosition(edit);
        const node = createNode
          ? createNode(edit.label.trim())
          : { id: crypto.randomUUID(), label: edit.label.trim() };
        change = { type: "create", ...position, node };
      } catch (cause) {
        reject(
          cause instanceof Error ? cause.message : "Unable to create the item.",
        );
        return;
      }
      if (perform(change)) setEdit(null);
    }
  }
  function startEdit(next: Edit) {
    setError("");
    if (next.type === "create") {
      setQuery("");
      reveal(next.parentId);
    }
    setEdit(next);
  }
  function cancelEdit() {
    setEdit(null);
    setError("");
    focusNode(selected);
  }
  function input() {
    return (
      <div
        className="flex min-w-0 flex-wrap items-center gap-2"
        data-tree-draft={edit?.type === "create" || undefined}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") {
            event.preventDefault();
            cancelEdit();
          }
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            event.preventDefault();
            saveEdit();
          }
        }}
      >
        <Input
          aria-label={labels.name}
          placeholder={labels.name}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          size={size}
          disabled={locked}
          value={edit?.label ?? ""}
          className="min-w-32 flex-1"
          ref={(element) => {
            if (element && document.activeElement !== element) {
              requestAnimationFrame(() => {
                element.focus();
                element.select();
              });
            }
          }}
          onChange={(event) =>
            setEdit((previous) =>
              previous ? { ...previous, label: event.target.value } : null,
            )
          }
        />
        <Button size={size} disabled={locked} onClick={saveEdit}>
          {labels.save}
        </Button>
        <Button size={size} variant="ghost" onClick={cancelEdit}>
          {labels.cancel}
        </Button>
      </div>
    );
  }
  function move(
    sourceId: string,
    targetId: string | null,
    position: DropPosition,
  ) {
    const source = entries.get(sourceId);
    const target = targetId ? entries.get(targetId) : undefined;
    if (!source || (targetId !== null && !target)) {
      reject("The item or destination no longer exists.");
      return false;
    }
    const parentId = target
      ? position === "inside"
        ? target.node.id
        : target.parentId
      : null;
    const siblings = parentId
      ? (entries.get(parentId)!.node.children ?? [])
      : nodes;
    let index =
      target && position !== "inside"
        ? target.index + (position === "after" ? 1 : 0)
        : siblings.length;
    if (source.parentId === parentId && source.index < index) index--;
    return perform({ type: "move", id: sourceId, parentId, index });
  }
  function closeMenu(event: Event, returnTo?: string) {
    if (menuAction.current) {
      event.preventDefault();
      menuAction.current = false;
    } else if (returnTo !== undefined) {
      event.preventDefault();
      focusNode(returnTo);
    }
  }
  function actionItems(
    nodeId: string | null,
    Item: typeof DropdownMenuItem | typeof ContextMenuItem = DropdownMenuItem,
  ) {
    const entry = nodeId ? entries.get(nodeId) : undefined;
    const blocked = locked || !!edit || !entry || entry.disabled;
    function begin(action: () => void) {
      if (blocked) return;
      menuAction.current = true;
      action();
    }
    return (
      <>
        {(["before", "after"] as const).map((position) => (
          <Item
            key={position}
            disabled={blocked}
            onSelect={() =>
              begin(() => {
                startEdit({
                  type: "create",
                  parentId: entry!.parentId,
                  label: "",
                  anchor: { id: entry!.node.id, position },
                });
              })
            }
          >
            {position === "before" ? labels.addAbove : labels.addBelow}
          </Item>
        ))}
        <Item
          disabled={blocked}
          onSelect={() =>
            begin(() =>
              startEdit({
                type: "rename",
                id: entry!.node.id,
                label: entry!.node.label,
              }),
            )
          }
        >
          {labels.rename}
        </Item>
        <Item
          disabled={blocked || !!query.trim()}
          onSelect={() =>
            begin(() => {
              setDestination(null);
              setMoveId(nodeId);
              setError("");
            })
          }
        >
          {labels.move}
        </Item>
        <Item
          disabled={blocked || !!query.trim() || entry?.index === 0}
          onSelect={() => {
            if (!blocked && entry)
              perform({
                type: "move",
                id: entry.node.id,
                parentId: entry.parentId,
                index: entry.index - 1,
              });
          }}
        >
          {labels.moveUp}
        </Item>
        <Item
          disabled={
            blocked ||
            !!query.trim() ||
            !entry ||
            entry.index >=
              (entry.parentId
                ? entries.get(entry.parentId)!.node.children!.length
                : nodes.length) -
                1
          }
          onSelect={() => {
            if (!blocked && entry)
              perform({
                type: "move",
                id: entry.node.id,
                parentId: entry.parentId,
                index: entry.index + 1,
              });
          }}
        >
          {labels.moveDown}
        </Item>
        <Item
          variant="destructive"
          disabled={blocked}
          onSelect={() =>
            begin(() => {
              setRemoveId(nodeId);
              setError("");
            })
          }
        >
          {labels.remove}
        </Item>
      </>
    );
  }
  const selectedLocked = !current || current.disabled || locked;
  return (
    <div
      {...props}
      data-slot="tree-editor"
      aria-busy={pending || undefined}
      className={cn(treeEditorVariants({ size: size ?? "md" }), className)}
    >
      {!readOnly && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label={label}
        >
          <Button
            ref={addButtonRef}
            size={size}
            className="touch-manipulation"
            disabled={locked || !!edit}
            onClick={() =>
              startEdit({ type: "create", parentId: null, label: "" })
            }
          >
            {labels.addRoot}
          </Button>
          <Button
            size={size}
            variant="outline"
            className="touch-manipulation"
            disabled={selectedLocked || !!edit}
            onClick={() => {
              if (selected)
                startEdit({ type: "create", parentId: selected, label: "" });
            }}
          >
            {labels.addChild}
          </Button>
          <DropdownMenu size={size}>
            <DropdownMenuTrigger disabled={selectedLocked || !!edit}>
              {labels.actions}
            </DropdownMenuTrigger>
            <DropdownMenuContent onCloseAutoFocus={(event) => closeMenu(event)}>
              {actionItems(selected)}
            </DropdownMenuContent>
          </DropdownMenu>
          {current && (
            <span className="min-w-0 text-muted-foreground wrap-anywhere">
              {current.node.label}
            </span>
          )}
        </div>
      )}
      <DragDropProvider
        sensors={sensors}
        plugins={plugins}
        onDragStart={(event) => {
          const key = event.operation.source?.data.nodeId;
          if (typeof key !== "string") return;
          dragSnapshot.current = nodes;
          const rect = event.operation.source?.element?.getBoundingClientRect();
          if (rect && event.nativeEvent instanceof PointerEvent) {
            setDragOffset({
              x: event.nativeEvent.clientX - rect.left + 12,
              y: event.nativeEvent.clientY - rect.top + 12,
            });
          }
          setActiveDrag(key);
          setError("");
        }}
        onDragEnd={(event) => {
          const sourceId = event.operation.source?.data.nodeId;
          const target = event.operation.target?.data;
          setActiveDrag(null);
          if (event.canceled || !target || typeof sourceId !== "string") {
            focusNode(typeof sourceId === "string" ? sourceId : selected);
            return;
          }
          if (dragSnapshot.current !== nodes) {
            reject("The tree changed while dragging. Try again.");
            focusNode(sourceId);
            return;
          }
          if (draggingDisabled) return;
          if (
            (target.nodeId === null || typeof target.nodeId === "string") &&
            (target.position === "before" ||
              target.position === "inside" ||
              target.position === "after")
          )
            move(sourceId, target.nodeId, target.position);
        }}
      >
        <Tree
          ref={treeRef}
          nodes={displayNodes}
          size={size}
          label={label}
          searchLabel={searchLabel}
          emptyMessage={emptyMessage}
          disabled={disabled || pending}
          filter={filter}
          filterValue={query}
          onFilterChange={setQuery}
          selectionMode="single"
          selectedIds={
            edit?.type === "create" ? [draftId] : selected ? [selected] : []
          }
          onSelectionChange={(ids) => {
            if (ids[0] !== draftId) choose(ids[0] ?? null);
          }}
          expandedIds={expanded}
          onExpandedChange={expand}
          renderIcon={renderIcon}
          onContextMenu={(event) => {
            if (!enableContextMenu) return;
            const target = event.target as HTMLElement;
            const row = target.closest<HTMLElement>("[data-tree-row]");
            const trigger = row?.querySelector<HTMLElement>(
              '[data-slot="context-menu-trigger"]',
            );
            if (trigger && !trigger.contains(target)) {
              event.preventDefault();
              trigger.dispatchEvent(
                new MouseEvent("contextmenu", {
                  clientX: event.clientX,
                  clientY: event.clientY,
                  bubbles: true,
                  cancelable: true,
                }),
              );
            }
          }}
          onKeyDown={(event) => {
            if (
              (enableContextMenu || showNodeActions) &&
              !event.defaultPrevented &&
              (event.key === "ContextMenu" ||
                (event.key === "F10" && event.shiftKey))
            ) {
              const target = event.target as HTMLElement;
              const treeItem = target.closest<HTMLElement>("[data-tree-id]");
              const nodeId = treeItem?.dataset.treeId;
              if (!nodeId || entries.get(nodeId)?.disabled || locked || !!edit)
                return;

              const button = treeItem?.querySelector<HTMLButtonElement>(
                'button[aria-haspopup="menu"]',
              );
              if (button) {
                event.preventDefault();
                button.click();
                return;
              }
              const trigger = treeItem?.querySelector<HTMLElement>(
                '[data-slot="context-menu-trigger"]',
              );
              if (trigger && enableContextMenu) {
                event.preventDefault();
                const rect = treeItem!
                  .querySelector("[data-tree-row]")!
                  .getBoundingClientRect();
                trigger.dispatchEvent(
                  new MouseEvent("contextmenu", {
                    clientX: rect.left + 16,
                    clientY: rect.bottom,
                    bubbles: true,
                    cancelable: true,
                  }),
                );
              }
            }
          }}
          renderNode={(node, state) =>
            (edit?.type === "rename" && edit.id === node.id) ||
            (edit?.type === "create" && node.id === draftId) ? (
              input()
            ) : (
              <ContextMenu size={size}>
                <ContextMenuTrigger
                  asChild
                  disabled={
                    !enableContextMenu || locked || !!edit || state.disabled
                  }
                >
                  <div
                    data-slot="context-menu-trigger"
                    className="flex min-w-0 flex-1 items-center"
                    onContextMenu={() => {
                      if (enableContextMenu && !locked && !state.disabled) {
                        choose(node.id);
                      }
                    }}
                  >
                    <EditorNode
                      node={node}
                      disabled={draggingDisabled || state.disabled}
                      dropDisabled={!activeDrag || blockedTargets.has(node.id)}
                      active={activeDrag}
                      dragLabel={labels.drag(node.label)}
                      actions={
                        showNodeActions && !readOnly ? (
                          <DropdownMenu
                            size={size}
                            className="shrink-0"
                            onOpenChange={(open) => {
                              if (open) choose(node.id);
                            }}
                          >
                            <DropdownMenuTrigger
                              iconOnly
                              variant="ghost"
                              className="shrink-0"
                              style={{ width: "1.5rem", height: "1.5rem" }}
                              tabIndex={-1}
                              aria-label={`${labels.actions}: ${node.label}`}
                              disabled={locked || !!edit || state.disabled}
                            >
                              <svg
                                aria-hidden="true"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                                className="size-4"
                              >
                                <circle cx="5" cy="12" r="1.5" />
                                <circle cx="12" cy="12" r="1.5" />
                                <circle cx="19" cy="12" r="1.5" />
                              </svg>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent
                              align="end"
                              aria-label={`${labels.actions}: ${node.label}`}
                              onCloseAutoFocus={(event) => closeMenu(event)}
                            >
                              {actionItems(node.id, DropdownMenuItem)}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : null
                      }
                    >
                      {node.label}
                    </EditorNode>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent
                  aria-label={`${labels.actions}: ${node.label}`}
                  onCloseAutoFocus={(event) => closeMenu(event, node.id)}
                >
                  {actionItems(node.id, ContextMenuItem)}
                </ContextMenuContent>
              </ContextMenu>
            )
          }
        />
        {!readOnly && (
          <DropTarget
            nodeId={null}
            position="inside"
            disabled={!activeDrag || draggingDisabled}
            root
          />
        )}
        <DragOverlay
          className="pointer-events-none fixed"
          dropAnimation={null}
          style={{
            width: "max-content",
            height: "auto",
            maxWidth: "min(20rem, calc(100vw - 2rem))",
            marginLeft: dragOffset.x,
            marginTop: dragOffset.y,
          }}
        >
          {draggedNode && (
            <div
              aria-hidden="true"
              data-tree-preview=""
              className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
            >
              {renderIcon && (
                <span className="shrink-0">
                  {renderIcon(draggedNode, {
                    expanded: expanded.includes(draggedNode.id),
                    selected: true,
                    disabled: false,
                  })}
                </span>
              )}
              <span className="min-w-0 wrap-anywhere">{draggedNode.label}</span>
            </div>
          )}
        </DragOverlay>
      </DragDropProvider>
      <p role="status" aria-live="polite" className="text-muted-foreground">
        {message}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <AlertDialog
        open={removeId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRemoveId(null);
            setError("");
            focusNode(selected);
          }
        }}
        title={labels.removeTitle}
        description={
          removeNode
            ? labels.removeDescription(
                removeNode.label,
                getTreeEntries([removeNode]).size - 1,
              )
            : "The item no longer exists."
        }
        confirmLabel={labels.remove}
        cancelLabel={labels.cancel}
        pending={locked}
        error={error}
        onConfirm={() => {
          if (removeId && perform({ type: "remove", id: removeId }))
            setRemoveId(null);
        }}
      />
      <Dialog
        open={moveId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMoveId(null);
            setError("");
            focusNode(selected);
          }
        }}
        aria-labelledby={`${id}-move-title`}
        aria-describedby={`${id}-move-description`}
      >
        <DialogHeader>
          <DialogTitle id={`${id}-move-title`}>{labels.moveTitle}</DialogTitle>
          <DialogDescription id={`${id}-move-description`}>
            {labels.moveDescription}
          </DialogDescription>
        </DialogHeader>
        <DialogContent className="space-y-3">
          <Tree
            nodes={nodes}
            label={labels.moveTitle}
            selectionMode="single"
            selectedIds={destination ? [destination] : []}
            onSelectionChange={(ids) => setDestination(ids[0] ?? null)}
            defaultExpandedIds={[...entries.keys()]}
            disabled={locked}
          />
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
        </DialogContent>
        <DialogFooter className="flex-wrap">
          <Button
            size={size}
            variant="outline"
            disabled={locked}
            onClick={() => {
              if (moveId && move(moveId, null, "inside")) setMoveId(null);
            }}
          >
            {labels.moveRoot}
          </Button>
          {(["before", "inside", "after"] as const).map((position) => (
            <Button
              key={position}
              size={size}
              disabled={locked || !destination || destination === moveId}
              onClick={() => {
                if (moveId && move(moveId, destination, position))
                  setMoveId(null);
              }}
            >
              {labels[position]}
            </Button>
          ))}
        </DialogFooter>
      </Dialog>
    </div>
  );
}
function EditorNode<T>({
  node,
  disabled,
  dropDisabled,
  active,
  dragLabel,
  actions,
  children,
}: {
  node: TreeNode<T>;
  disabled: boolean;
  dropDisabled: boolean;
  active: string | null;
  dragLabel: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { ref, isDragging } = useDraggable({
    id: `tree:${node.id}`,
    type: "tree-node",
    disabled,
    data: { nodeId: node.id },
  });
  const attachRow = useCallback(
    (element: HTMLDivElement | null) => {
      ref(element?.closest<HTMLDivElement>("[data-tree-row]") ?? null);
    },
    [ref],
  );
  return (
    <div
      ref={attachRow}
      data-tree-draggable={!disabled || undefined}
      data-tree-dragging={isDragging || undefined}
      title={disabled ? undefined : dragLabel}
      className="flex min-w-0 items-center"
    >
      <span className="min-w-0 flex-1 wrap-anywhere">{children}</span>
      {actions}
      {active &&
        !dropDisabled &&
        !disabled &&
        (["before", "inside", "after"] as const).map((position) => (
          <DropTarget
            key={position}
            nodeId={node.id}
            position={position}
            disabled={false}
          />
        ))}
    </div>
  );
}
function DropTarget({
  nodeId,
  position,
  disabled,
  root = false,
}: {
  nodeId: string | null;
  position: DropPosition;
  disabled: boolean;
  root?: boolean;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `tree-drop:${JSON.stringify([nodeId, position])}`,
    accept: "tree-node",
    disabled,
    data: { nodeId, position },
  });
  return (
    <div
      ref={ref}
      data-tree-drop={position}
      data-tree-target={nodeId ?? "root"}
      data-drop-active={isDropTarget || undefined}
      aria-hidden="true"
      className={cn(
        "absolute inset-x-0 z-10",
        position === "before" && "top-0 h-1/4",
        position === "inside" && "top-1/4 h-1/2",
        position === "after" && "bottom-0 h-1/4",
        root && "relative top-auto mt-1 h-3",
        disabled && "hidden",
      )}
    >
      {isDropTarget && (
        <span
          className={cn(
            "pointer-events-none absolute inset-x-0",
            root || position === "after"
              ? "bottom-0 border-b-2 border-ring"
              : position === "before"
                ? "top-0 border-t-2 border-ring"
                : "-top-1/2 h-[200%] rounded-sm ring-1 ring-ring ring-inset",
          )}
        />
      )}
    </div>
  );
}
