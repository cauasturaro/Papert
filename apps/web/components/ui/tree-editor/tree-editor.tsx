"use client";

import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { DragDropProvider, DragOverlay } from "@dnd-kit/react";
import { cn } from "@/lib/utils";
import { Button } from "../button/button";
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
import { RowActionsMenu } from "./tree-editor-actions";
import {
  TreeEditorMoveDialog,
  TreeEditorRemoveDialog,
} from "./tree-editor-dialogs";
import {
  DragPreview,
  DropTarget,
  EditorNode,
  plugins,
  sensors,
} from "./tree-editor-dnd";
import type { TreeEditorLabels } from "./tree-editor-labels";
import {
  forwardRowContextMenu,
  isMenuShortcut,
  openItemMenu,
  shortcutItemId,
} from "./tree-editor-menus";
import { TreeEditorNameInput } from "./tree-editor-name-input";
import { useTreeDrag } from "./use-tree-drag";
import { useTreeEditing } from "./use-tree-editing";
import { TreeEditorActionMenu } from "./tree-editor-action-menu";

export type { TreeNode, TreeChange } from "../tree/tree-model";
export { applyTreeChange } from "../tree/tree-model";
export type { TreeEditorLabels } from "./tree-editor-labels";
export const treeEditorVariants = cva(
  "min-w-0 max-w-full space-y-3 [&_[data-tree-row]:has([data-tree-draggable])]:touch-none [&_[data-tree-row]:has([data-tree-draggable])]:cursor-grab [&_[data-tree-row]:has([data-tree-dragging])]:opacity-40",
  {
    variants: { size: { sm: "text-xs", md: "text-sm", lg: "text-base" } },
    defaultVariants: { size: "md" },
  },
);
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
    label?: string;
    searchLabel?: string;
    emptyMessage?: string;
    labels?: Partial<TreeEditorLabels>;
    renderIcon?: TreeProps<T>["renderIcon"];
    getItemLabel?: TreeProps<T>["getItemLabel"];
  };
export function TreeEditor<T>(props: TreeEditorProps<T>) {
  const error = validateTree(props.value ?? props.defaultValue ?? []);
  if (error) {
    return <p role="alert">{error}</p>;
  }
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
  getItemLabel,
  className,
  ...props
}: TreeEditorProps<T>) {
  const editing = useTreeEditing({
    value,
    defaultValue,
    onChange,
    canChange,
    createNode,
    onChangeRejected,
    selectedId,
    defaultSelectedId,
    onSelectedChange,
    expandedIds,
    defaultExpandedIds,
    onExpandedChange,
    disabled,
    readOnly,
    pending,
    labels: labelOverrides,
  });
  const {
    id,
    nodes,
    entries,
    selected,
    current,
    labels,
    locked,
    expanded,
    removeNode,
    query,
    setQuery,
    edit,
    setEdit,
    removeId,
    setRemoveId,
    moveId,
    setMoveId,
    destination,
    setDestination,
    message,
    error,
    setError,
    treeRef,
    addButtonRef,
    menuActionRef,
    choose,
    expand,
    focusNode,
    reject,
    perform,
    saveEdit,
    startEdit,
    cancelEdit,
    move,
    createPosition,
  } = editing;
  const draggingDisabled = locked || !!query.trim() || !!edit;
  const drag = useTreeDrag({
    nodes,
    onStart: () => setError(""),
    onCancel: (sourceId) => focusNode(sourceId ?? selected),
    onStale: (sourceId) => {
      reject("The tree changed while dragging. Try again.");
      focusNode(sourceId);
    },
    onDrop: (sourceId, targetId, position) => {
      if (!draggingDisabled) {
        move(sourceId, targetId, position);
      }
    },
  });
  const activeDrag = drag.activeDrag;
  const draggedNode = activeDrag ? entries.get(activeDrag)?.node : undefined;
  const blockedTargets = new Set(
    draggedNode ? getTreeEntries([draggedNode]).keys() : [],
  );
  let draftId = `${id}-draft`;
  while (entries.has(draftId)) {
    draftId += "-";
  }
  let displayNodes = nodes;
  if (edit?.type === "create") {
    const draft: TreeNode<T> = {
      id: draftId,
      label: labels.createTitle || labels.name || "New item",
    };
    try {
      displayNodes = applyTreeChange(nodes, {
        type: "create",
        ...createPosition(edit),
        node: draft,
      });
    } catch {
      // Keeps the draft cancelable if the destination changes while editing.
      displayNodes = [...nodes, draft];
    }
  }

  function input() {
    return (
      <TreeEditorNameInput
        value={edit?.label ?? ""}
        creating={edit?.type === "create"}
        invalid={!!error}
        errorId={`${id}-error`}
        size={size}
        locked={locked}
        labels={labels}
        onChange={(label) =>
          setEdit((previous) => (previous ? { ...previous, label } : null))
        }
        onSave={saveEdit}
        onCancel={cancelEdit}
      />
    );
  }

  function closeMenu(event: Event, returnTo?: string) {
    if (menuActionRef.current) {
      event.preventDefault();
      menuActionRef.current = false;
    } else if (returnTo !== undefined) {
      event.preventDefault();
      focusNode(returnTo);
    }
  }
  let displaySelected = selected ? [selected] : [];
  if (edit?.type === "create") {
    displaySelected = [draftId];
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
          data-slot="tree-editor-toolbar"
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
              if (selected) {
                startEdit({
                  type: "create", parentId: selected, label: ""
                });
              }
            }}
          >
            {labels.addChild}
          </Button>
          <DropdownMenu size={size}>
            <DropdownMenuTrigger disabled={selectedLocked || !!edit}>
              {labels.actions}
            </DropdownMenuTrigger>
            <DropdownMenuContent onCloseAutoFocus={(event) => closeMenu(event)}>
              <TreeEditorActionMenu
                {...editing}
                nodeId={selected}
              />
            </DropdownMenuContent>
          </DropdownMenu>
          {current && (
            <span
              data-slot="tree-editor-selected-label"
              className="min-w-0 text-muted-foreground wrap-anywhere"
            >
              {current.node.label}
            </span>
          )}
        </div>
      )}
      <DragDropProvider
        sensors={sensors}
        plugins={plugins}
        onDragStart={drag.handleDragStart}
        onDragEnd={drag.handleDragEnd}
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
          selectedIds={displaySelected}
          onSelectionChange={(ids) => {
            if (ids[0] !== draftId) {
              choose(ids[0] ?? null);
            }
          }}
          expandedIds={expanded}
          onExpandedChange={expand}
          renderIcon={renderIcon}
          getItemLabel={getItemLabel}
          onContextMenu={(event) => {
            if (enableContextMenu) {
              forwardRowContextMenu(event);
            }
          }}
          onKeyDown={(event) => {
            if (
              !(enableContextMenu || showNodeActions) ||
              !isMenuShortcut(event)
            ) {
              return;
            }

            const nodeId = shortcutItemId(event);

            if (!nodeId || entries.get(nodeId)?.disabled || locked || !!edit) {
              return;
            }

            openItemMenu(event, enableContextMenu);
          }}
          renderNode={(node, state) => {
            const isEditing =
              (edit?.type === "rename" && edit.id === node.id) ||
              (edit?.type === "create" && node.id === draftId);

            if (isEditing) {
              return input();
            }

            return (
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
                          <RowActionsMenu
                            label={`${labels.actions}: ${node.label}`}
                            size={size}
                            disabled={locked || !!edit || state.disabled}
                            onOpen={() => choose(node.id)}
                            onCloseAutoFocus={(event) => closeMenu(event)}
                          >
                            <TreeEditorActionMenu
                              {...editing}
                              nodeId={node.id}
                              Item={DropdownMenuItem}
                            />
                          </RowActionsMenu>
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
                  <TreeEditorActionMenu
                    {...editing}
                    nodeId={node.id}
                    Item={ContextMenuItem}
                  />
                </ContextMenuContent>
              </ContextMenu>
            );
          }}
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
            marginLeft: drag.dragOffset.x,
            marginTop: drag.dragOffset.y,
          }}
        >
          {draggedNode && (
            <DragPreview
              node={draggedNode}
              expanded={expanded.includes(draggedNode.id)}
              renderIcon={renderIcon}
            />
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
      <TreeEditorRemoveDialog
        open={removeId !== null}
        node={removeNode}
        labels={labels}
        locked={locked}
        error={error}
        onClose={() => {
          setRemoveId(null);
          setError("");
          focusNode(selected);
        }}
        onConfirm={() => {
          if (removeId && perform({ type: "remove", id: removeId })) {
            setRemoveId(null);
          }
        }}
      />
      <TreeEditorMoveDialog
        id={id}
        open={moveId !== null}
        nodes={nodes}
        allIds={[...entries.keys()]}
        movingId={moveId}
        destination={destination}
        labels={labels}
        size={size}
        locked={locked}
        error={error}
        onDestinationChange={setDestination}
        onClose={() => {
          setMoveId(null);
          setError("");
          focusNode(selected);
        }}
        onMove={(targetId, position) => {
          if (moveId && move(moveId, targetId, position)) {
            setMoveId(null);
          }
        }}
      />
    </div>
  );
}
