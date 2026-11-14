"use client";

import { Button } from "../button/button";
import { AlertDialog } from "../alert-dialog/alert-dialog";
import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
} from "../dialog/dialog";
import { Tree } from "../tree/tree";
import { getTreeEntries, type TreeNode } from "../tree/tree-model";
import type { TreeEditorLabels } from "./tree-editor-labels";
import type { DropPosition } from "./tree-editor-positions";

type RemoveDialogProps<T> = {
  open: boolean;
  node: TreeNode<T> | undefined;
  labels: TreeEditorLabels;
  locked: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
};

/** Confirms deleting an item together with its subtree. */
export function TreeEditorRemoveDialog<T>({
  open,
  node,
  labels,
  locked,
  error,
  onClose,
  onConfirm,
}: RemoveDialogProps<T>) {
  const description = node
    ? labels.removeDescription(node.label, getTreeEntries([node]).size - 1)
    : "The item no longer exists.";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      title={labels.removeTitle}
      description={description}
      confirmLabel={labels.remove}
      cancelLabel={labels.cancel}
      pending={locked}
      error={error}
      onConfirm={onConfirm}
    />
  );
}

type MoveDialogProps<T> = {
  id: string;
  open: boolean;
  nodes: readonly TreeNode<T>[];
  allIds: string[];
  movingId: string | null;
  destination: string | null;
  labels: TreeEditorLabels;
  size?: "sm" | "md" | "lg" | null;
  locked: boolean;
  error: string;
  onDestinationChange: (id: string | null) => void;
  onClose: () => void;
  onMove: (targetId: string | null, position: DropPosition) => void;
};

/** Keyboard-friendly move: pick a destination in a tree, then a position. */
export function TreeEditorMoveDialog<T>({
  id,
  open,
  nodes,
  allIds,
  movingId,
  destination,
  labels,
  size,
  locked,
  error,
  onDestinationChange,
  onClose,
  onMove,
}: MoveDialogProps<T>) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
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
          onSelectionChange={(ids) => onDestinationChange(ids[0] ?? null)}
          defaultExpandedIds={allIds}
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
          onClick={() => onMove(null, "inside")}
        >
          {labels.moveRoot}
        </Button>
        {(["before", "inside", "after"] as const).map((position) => (
          <Button
            key={position}
            size={size}
            disabled={locked || !destination || destination === movingId}
            onClick={() => onMove(destination, position)}
          >
            {labels[position]}
          </Button>
        ))}
      </DialogFooter>
    </Dialog>
  );
}
