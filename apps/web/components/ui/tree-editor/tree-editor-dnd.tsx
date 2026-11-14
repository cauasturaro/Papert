"use client";

import { useCallback, type ComponentProps, type ReactNode } from "react";
import { DragDropProvider, useDraggable, useDroppable } from "@dnd-kit/react";
import {
  Accessibility,
  Feedback,
  PointerSensor,
  PointerActivationConstraints,
} from "@dnd-kit/dom";
import { cn } from "@/lib/utils";
import type { TreeProps } from "../tree/tree";
import type { TreeNode } from "../tree/tree-model";
import type { DropPosition } from "./tree-editor-positions";

export const sensors = [
  PointerSensor.configure({
    activationConstraints: [
      new PointerActivationConstraints.Distance({ value: 6 }),
    ],
  }),
];
export const plugins: ComponentProps<typeof DragDropProvider>["plugins"] = (
  defaults,
) =>
  defaults
    .filter((plugin) => plugin !== Accessibility && plugin !== Feedback)
    .concat(Feedback.configure({ dropAnimation: null }));

export function EditorNode<T>({
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
export function DropTarget({
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

/** What follows the pointer while an item is dragged. */
export function DragPreview<T>({
  node,
  expanded,
  renderIcon,
}: {
  node: TreeNode<T>;
  expanded: boolean;
  renderIcon?: TreeProps<T>["renderIcon"];
}) {
  return (
    <div
      aria-hidden="true"
      data-tree-preview=""
      className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
    >
      {renderIcon && (
        <span className="shrink-0">
          {renderIcon(node, { expanded, selected: true, disabled: false })}
        </span>
      )}
      <span className="min-w-0 wrap-anywhere">{node.label}</span>
    </div>
  );
}
