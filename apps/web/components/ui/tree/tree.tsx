"use client";

import {
  type ComponentProps,
  type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Input } from "../input/input";
import { Checkbox } from "../checkbox/checkbox";
import { EmptyState, EmptyStateTitle } from "../empty-state/empty-state";
import {
  validateTree,
  type TreeNode,
} from "./tree-model";
import { useTreeNavigation } from "./use-tree-navigation";

export type { TreeNode, TreeCheckState } from "./tree-model";

export const treeVariants = cva(
  "min-w-0 max-w-full rounded-lg border border-border bg-card p-2 text-card-foreground",
  {
    variants: {
      size: {
        sm: "text-xs [--tree-row:2rem] [--tree-indent:1rem] max-sm:[--tree-indent:0.625rem]",
        md: "text-sm [--tree-row:2.5rem] [--tree-indent:1.25rem] max-sm:[--tree-indent:0.75rem]",
        lg: "text-base [--tree-row:3rem] [--tree-indent:1.5rem] max-sm:[--tree-indent:0.875rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);
export type TreeNodeState = {
  expanded: boolean;
  selected: boolean;
  disabled: boolean;
};
export type TreeProps<T = unknown> = Omit<
  ComponentProps<"div">,
  "children" | "onSelect" | "defaultValue" | "dangerouslySetInnerHTML"
> &
  VariantProps<typeof treeVariants> & {
    nodes?: readonly TreeNode<T>[];
    selectionMode?: "none" | "single" | "multiple" | "checkbox";
    selectedIds?: readonly string[];
    defaultSelectedIds?: readonly string[];
    onSelectionChange?: (ids: string[]) => void;
    expandedIds?: readonly string[];
    defaultExpandedIds?: readonly string[];
    onExpandedChange?: (ids: string[]) => void;
    filter?: boolean;
    filterValue?: string;
    defaultFilterValue?: string;
    onFilterChange?: (value: string) => void;
    disabled?: boolean;
    label?: string;
    searchLabel?: string;
    emptyMessage?: string;
    renderNode?: (node: TreeNode<T>, state: TreeNodeState) => ReactNode;
    renderIcon?: (node: TreeNode<T>, state: TreeNodeState) => ReactNode;
    // Accessible name of a row when it must say more than the label, such as "app.ts, unsaved".
    getItemLabel?: (node: TreeNode<T>) => string;
  };
export function Tree<T>(props: TreeProps<T>) {
  const error = validateTree(props.nodes ?? []);
  if (error) {
    return <p role="alert">{error}</p>;
  }
  return <TreeControl {...props} />;
}

function TreeControl<T>({
  nodes = [],
  size = "md",
  selectionMode = "none",
  selectedIds,
  defaultSelectedIds = [],
  onSelectionChange,
  expandedIds,
  defaultExpandedIds = [],
  onExpandedChange,
  filter = false,
  filterValue,
  defaultFilterValue = "",
  onFilterChange,
  disabled = false,
  label = "Tree",
  searchLabel = "Search the tree",
  emptyMessage = "No items found.",
  renderNode,
  renderIcon,
  getItemLabel,
  className,
  onFocusCapture,
  onBlurCapture,
  ...props
}: TreeProps<T>) {
  const navigation = useTreeNavigation({
    nodes,
    selectionMode,
    selectedIds,
    defaultSelectedIds,
    onSelectionChange,
    expandedIds,
    defaultExpandedIds,
    onExpandedChange,
    filterValue,
    defaultFilterValue,
    disabled,
  });
  const { id, localFilter, setFilter, hadFocusRef, visible } = navigation;

  return (
    <div
      {...props}
      data-slot="tree"
      className={cn(treeVariants({ size: size ?? "md" }), className)}
      onFocusCapture={(event) => {
        hadFocusRef.current =
          !!(event.target as HTMLElement).closest('[role="treeitem"]') &&
          event.target ===
          (event.target as HTMLElement).closest('[role="treeitem"]');
        onFocusCapture?.(event);
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget) {
          hadFocusRef.current = false;
        }
        onBlurCapture?.(event);
      }}
    >
      {filter && (
        <Input
          id={`${id}-search`}
          type="search"
          size={size}
          className="mb-2"
          aria-label={searchLabel}
          placeholder={searchLabel}
          disabled={disabled}
          value={filterValue ?? localFilter}
          onChange={(event) => {
            if (filterValue === undefined) {
              setFilter(event.target.value);
            }
            onFilterChange?.(event.target.value);
          }}
        />
      )}
      {visible.length ? (
        <div className="overflow-x-auto">
          <TreeList
            nodes={nodes}
            root
            navigation={navigation}
            size={size}
            selectionMode={selectionMode}
            disabled={disabled}
            renderNode={renderNode}
            renderIcon={renderIcon}
            getItemLabel={getItemLabel}
            label={label}
          />
        </div>
      ) : (
        <EmptyState size={size}>
          <EmptyStateTitle>{emptyMessage}</EmptyStateTitle>
        </EmptyState>
      )}
    </div>
  );
}

type TreeListProps<T> = Pick<TreeProps<T>, "size" | "selectionMode" | "disabled" | "renderNode" | "renderIcon" | "getItemLabel" | "label"> & {
  nodes: readonly TreeNode<T>[];
  root?: boolean;
  navigation: ReturnType<typeof useTreeNavigation<T>>;
};

function TreeList<T>({ nodes: itemsToRender, root = false, navigation, ...presentation }: TreeListProps<T>) {
  const { query, shown } = navigation;
  const { label, selectionMode, disabled } = presentation;
  return (
    <ul
      role={root ? "tree" : "group"}
      aria-label={root ? label : undefined}
      aria-multiselectable={
        root && (selectionMode === "multiple" || selectionMode === "checkbox")
          ? true
          : undefined
      }
      aria-disabled={(root && disabled) || undefined}
      className={
        root ? "min-w-0" : "min-w-0 border-s border-border ps-(--tree-indent)"
      }
    >
      {itemsToRender
        .filter((node) => !query || shown.has(node.id))
        .map((node) => {
          return (
            <TreeItem
              key={node.id}
              {...presentation}
              navigation={navigation}
              node={node}
            />
          );
        })}
    </ul>
  );
}

function TreeItem<T>({ node, navigation, ...presentation }: Omit<TreeListProps<T>, "nodes" | "root"> & { node: TreeNode<T> }) {
  const {
    entries,
    expanded,
    checks,
    selected,
    query,
    activeId,
    items,
    rememberFocus,
    focus,
    toggleExpanded,
    select,
    onItemKeyDown,
  } = navigation;
  const {
    size,
    selectionMode,
    disabled,
    renderNode,
    renderIcon,
    getItemLabel,
  } = presentation;
  const entry = entries.get(node.id)!;
  const hasChildren = !!node.children?.length;
  const open = hasChildren && (!!query || expanded.has(node.id));
  const checked = checks.get(node.id)!;
  const isSelected =
    selectionMode === "checkbox"
      ? checked.checked
      : selected.includes(node.id);
  const locked = disabled || entry.disabled;
  const ariaChecked = checked.mixed ? "mixed" : checked.checked;
  const state = {
    expanded: open,
    selected: isSelected,
    disabled: locked,
  };
  return (
    <li
      ref={(element) => {
        if (element) {
          items.current.set(node.id, element);
        } else {
          items.current.delete(node.id);
        }
      }}
      role="treeitem"
      data-tree-id={node.id}
      aria-label={getItemLabel?.(node) ?? node.label}
      aria-expanded={hasChildren ? open : undefined}
      aria-disabled={locked || undefined}
      aria-selected={
        selectionMode === "single" || selectionMode === "multiple"
          ? isSelected
          : undefined
      }
      aria-checked={
        selectionMode === "checkbox" ? ariaChecked : undefined
      }
      tabIndex={node.id === activeId ? 0 : -1}
      className="min-w-0 list-none rounded-sm outline-none focus-visible:[&>div]:outline-2 focus-visible:[&>div]:-outline-offset-2 focus-visible:[&>div]:outline-ring"
      onFocus={(event) => {
        if (event.target === event.currentTarget) {
          rememberFocus(node.id);
        }
      }}
      onKeyDown={(event) => onItemKeyDown(event, node)}
    >
      <div
        data-tree-row=""
        data-selected={isSelected || undefined}
        className={cn(
          "relative flex min-h-(--tree-row) min-w-48 items-center gap-2 rounded-sm px-2 py-1 hover:bg-accent/50 data-[selected]:bg-accent data-[selected]:text-accent-foreground forced-colors:data-[selected]:outline",
          locked && "opacity-60",
        )}
        onClick={(event) => {
          if (
            (event.target as HTMLElement).closest(
              "button,input,a,select,textarea,[role=button]",
            )
          ) {
            return;
          }
          focus(node.id);
          select(node.id);
        }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={`${open ? "Collapse" : "Expand"} ${node.label}`}
          disabled={locked || !hasChildren || !!query}
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-sm touch-manipulation focus-visible:outline-2 focus-visible:outline-ring",
            !hasChildren && "invisible",
          )}
          onClick={() => {
            focus(node.id);
            toggleExpanded(node.id);
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            className="size-4"
          >
            <path d={open ? "m6 9 6 6 6-6" : "m9 6 6 6-6 6"} />
          </svg>
        </button>
        {selectionMode === "checkbox" && (
          <span aria-hidden="true">
            <Checkbox
              tabIndex={-1}
              size={size}
              disabled={locked}
              checked={checked.checked}
              aria-label={node.label}
              ref={(element) => {
                if (element) {
                  element.indeterminate = checked.mixed;
                }
              }}
              onChange={() => {
                focus(node.id);
                select(node.id);
              }}
              className="indeterminate:border-primary indeterminate:bg-primary indeterminate:[background-image:linear-gradient(currentColor,currentColor)] indeterminate:[background-size:60%_2px] indeterminate:bg-center indeterminate:bg-no-repeat indeterminate:text-primary-foreground"
            />
          </span>
        )}
        {renderIcon && (
          <span aria-hidden="true" className="shrink-0">
            {renderIcon(node, state)}
          </span>
        )}
        <div className="min-w-0 flex-1 wrap-anywhere">
          {renderNode ? renderNode(node, state) : node.label}
        </div>
      </div>
      {open && <TreeList {...presentation} navigation={navigation} nodes={node.children ?? []} />}
    </li>
  );
}
