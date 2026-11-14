"use client";

import type { ReactNode } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  type DropdownMenuItem,
} from "../dropdown-menu/dropdown-menu";
import type { ContextMenuItem } from "../context-menu/context-menu";
import type { TreeEditorLabels } from "./tree-editor-labels";

type ActionItemsProps = {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem;
  labels: TreeEditorLabels;
  // Locked, editing, or no usable item.
  blocked: boolean;
  // Reordering is off while the tree is filtered.
  filtering: boolean;
  first: boolean;
  last: boolean;
  onAddBeside: (position: "before" | "after") => void;
  onRename: () => void;
  onMove: () => void;
  onShift: (offset: -1 | 1) => void;
  onRemove: () => void;
};

/** The item menu shared by the toolbar, the row menu and the context menu. */
export function TreeEditorActionItems({
  Item,
  labels,
  blocked,
  filtering,
  first,
  last,
  onAddBeside,
  onRename,
  onMove,
  onShift,
  onRemove,
}: ActionItemsProps) {
  return (
    <>
      {(["before", "after"] as const).map((position) => (
        <Item
          key={position}
          disabled={blocked}
          onSelect={() => onAddBeside(position)}
        >
          {position === "before" ? labels.addAbove : labels.addBelow}
        </Item>
      ))}
      <Item disabled={blocked} onSelect={onRename}>
        {labels.rename}
      </Item>
      <Item disabled={blocked || filtering} onSelect={onMove}>
        {labels.move}
      </Item>
      <Item
        disabled={blocked || filtering || first}
        onSelect={() => onShift(-1)}
      >
        {labels.moveUp}
      </Item>
      <Item disabled={blocked || filtering || last} onSelect={() => onShift(1)}>
        {labels.moveDown}
      </Item>
      <Item variant="destructive" disabled={blocked} onSelect={onRemove}>
        {labels.remove}
      </Item>
    </>
  );
}

type RowActionsMenuProps = {
  label: string;
  size?: "sm" | "md" | "lg" | null;
  disabled: boolean;
  onOpen: () => void;
  onCloseAutoFocus: (event: Event) => void;
  children: ReactNode;
};

/** The "…" button at the end of a row, opening that item's actions. */
export function RowActionsMenu({
  label,
  size,
  disabled,
  onOpen,
  onCloseAutoFocus,
  children,
}: RowActionsMenuProps) {
  return (
    <DropdownMenu
      size={size}
      className="shrink-0"
      onOpenChange={(open) => {
        if (open) {
          onOpen();
        }
      }}
    >
      <DropdownMenuTrigger
        iconOnly
        variant="ghost"
        className="shrink-0"
        style={{ width: "1.5rem", height: "1.5rem" }}
        tabIndex={-1}
        aria-label={label}
        disabled={disabled}
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
        aria-label={label}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
