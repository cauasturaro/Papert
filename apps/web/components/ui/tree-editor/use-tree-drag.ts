"use client";

import { useRef, useState, type ComponentProps } from "react";
import type { DragDropProvider } from "@dnd-kit/react";
import type { TreeNode } from "../tree/tree-model";
import type { DropPosition } from "./tree-editor-positions";

type ProviderProps = ComponentProps<typeof DragDropProvider>;
type DragStartEvent = Parameters<NonNullable<ProviderProps["onDragStart"]>>[0];
type DragEndEvent = Parameters<NonNullable<ProviderProps["onDragEnd"]>>[0];

const DROP_POSITIONS: readonly unknown[] = ["before", "inside", "after"];

type Options<T> = {
  nodes: readonly TreeNode<T>[];
  onStart: () => void;
  // The drag ended without a drop; `sourceId` is null when the source was unknown.
  onCancel: (sourceId: string | null) => void;
  // The tree changed while the item was being dragged.
  onStale: (sourceId: string) => void;
  onDrop: (
    sourceId: string,
    targetId: string | null,
    position: DropPosition,
  ) => void;
};

/** Pointer drag and drop of tree items: the dragged id, the preview offset and the handlers. */
export function useTreeDrag<T>({
  nodes,
  onStart,
  onCancel,
  onStale,
  onDrop,
}: Options<T>) {
  const [activeDrag, setActiveDrag] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const snapshot = useRef<readonly TreeNode<T>[] | null>(null);

  function handleDragStart(event: DragStartEvent) {
    const key = event.operation.source?.data.nodeId;

    if (typeof key !== "string") {
      return;
    }

    snapshot.current = nodes;

    const rect = event.operation.source?.element?.getBoundingClientRect();

    if (rect && event.nativeEvent instanceof PointerEvent) {
      setDragOffset({
        x: event.nativeEvent.clientX - rect.left + 12,
        y: event.nativeEvent.clientY - rect.top + 12,
      });
    }

    setActiveDrag(key);
    onStart();
  }

  function handleDragEnd(event: DragEndEvent) {
    const sourceId = event.operation.source?.data.nodeId;
    const target = event.operation.target?.data;
    setActiveDrag(null);

    if (event.canceled || !target || typeof sourceId !== "string") {
      onCancel(typeof sourceId === "string" ? sourceId : null);
      return;
    }

    if (snapshot.current !== nodes) {
      onStale(sourceId);
      return;
    }

    const validTarget =
      (target.nodeId === null || typeof target.nodeId === "string") &&
      DROP_POSITIONS.includes(target.position);

    if (validTarget) {
      onDrop(sourceId, target.nodeId, target.position as DropPosition);
    }
  }

  return { activeDrag, dragOffset, handleDragStart, handleDragEnd };
}
