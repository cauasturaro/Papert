"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Input } from "../input/input";
import { Checkbox } from "../checkbox/checkbox";
import { EmptyState, EmptyStateTitle } from "../empty-state/empty-state";
import { TreeSkeleton } from "./tree-skeleton";
import {
  getTreeEntries,
  getTreeCheckStates,
  validateTree,
  type TreeNode,
} from "./tree-model";
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
    skeleton?: boolean;
    label?: string;
    searchLabel?: string;
    emptyMessage?: string;
    renderNode?: (node: TreeNode<T>, state: TreeNodeState) => ReactNode;
    renderIcon?: (node: TreeNode<T>, state: TreeNodeState) => ReactNode;
  };
export function Tree<T>({ skeleton = false, ...props }: TreeProps<T>) {
  if (skeleton)
    return (
      <TreeSkeleton
        id={props.id}
        style={props.style}
        className={props.className}
        size={props.size}
      />
    );
  const error = validateTree(props.nodes ?? []);
  if (error) return <p role="alert">{error}</p>;
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
  className,
  onFocusCapture,
  onBlurCapture,
  ...props
}: TreeProps<T>) {
  const id = useId();
  const [localSelected, setSelected] =
    useState<readonly string[]>(defaultSelectedIds);
  const [localExpanded, setExpanded] =
    useState<readonly string[]>(defaultExpandedIds);
  const [localFilter, setFilter] = useState(defaultFilterValue);
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const items = useRef(new Map<string, HTMLLIElement>());
  const hadFocus = useRef(false);
  const typeahead = useRef({ text: "", time: 0 });
  const selected = selectedIds ?? localSelected;
  const expanded = new Set(expandedIds ?? localExpanded);
  const query = (filterValue ?? localFilter)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const entries = getTreeEntries(nodes);
  const checks = getTreeCheckStates(nodes, selected);
  const shown = new Set<string>();
  if (query) {
    for (const { node } of entries.values()) {
      if (
        !node.label
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(query)
      )
        continue;
      let current: string | null = node.id;
      while (current !== null) {
        shown.add(current);
        current = entries.get(current)!.parentId;
      }
    }
  }
  const visible: string[] = [];
  function collect(items: readonly TreeNode<T>[]) {
    for (const node of items) {
      if (query && !shown.has(node.id)) continue;
      visible.push(node.id);
      if (query || expanded.has(node.id)) collect(node.children ?? []);
    }
  }
  collect(nodes);
  const activeId =
    focusPath.find((key) => visible.includes(key)) ??
    visible.find((key) => selected.includes(key)) ??
    visible[0] ??
    null;
  useLayoutEffect(() => {
    if (hadFocus.current && activeId) items.current.get(activeId)?.focus();
  }, [activeId]);
  function rememberFocus(key: string) {
    const path = [key];
    let parent = entries.get(key)?.parentId;
    while (parent) {
      path.push(parent);
      parent = entries.get(parent)?.parentId;
    }
    setFocusPath(path);
  }
  function focus(key: string | undefined) {
    if (!key) return;
    rememberFocus(key);
    items.current.get(key)?.focus();
  }
  function toggleExpanded(key: string) {
    if (
      disabled ||
      entries.get(key)?.disabled ||
      !entries.get(key)?.node.children?.length ||
      query
    )
      return;
    const next = new Set(expanded);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    if (expandedIds === undefined) setExpanded([...next]);
    onExpandedChange?.([...next]);
  }
  function select(key: string) {
    if (disabled || entries.get(key)?.disabled || selectionMode === "none")
      return;
    let next: string[];
    if (selectionMode === "single") next = [key];
    else if (selectionMode === "multiple")
      next = selected.includes(key)
        ? selected.filter((id) => id !== key)
        : [...selected, key];
    else {
      const nextIds = new Set(selected);
      const checked = checks.get(key)?.checked;
      function toggle(node: TreeNode<T>) {
        if (entries.get(node.id)?.disabled) return;
        if (checked) nextIds.delete(node.id);
        else nextIds.add(node.id);
        node.children?.forEach(toggle);
      }
      toggle(entries.get(key)!.node);
      const normalized = getTreeCheckStates(nodes, [...nextIds]);
      next = [...normalized]
        .filter(([, state]) => state.checked)
        .map(([id]) => id);
    }
    if (selectedIds === undefined) setSelected(next);
    onSelectionChange?.(next);
  }
  function render(
    itemsToRender: readonly TreeNode<T>[],
    root = false,
  ): ReactNode {
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
            const entry = entries.get(node.id)!;
            const hasChildren = !!node.children?.length;
            const open = hasChildren && (!!query || expanded.has(node.id));
            const checked = checks.get(node.id)!;
            const isSelected =
              selectionMode === "checkbox"
                ? checked.checked
                : selected.includes(node.id);
            const locked = disabled || entry.disabled;
            const state = {
              expanded: open,
              selected: isSelected,
              disabled: locked,
            };
            return (
              <li
                key={node.id}
                ref={(element) => {
                  if (element) items.current.set(node.id, element);
                  else items.current.delete(node.id);
                }}
                role="treeitem"
                data-tree-id={node.id}
                aria-label={node.label}
                aria-expanded={hasChildren ? open : undefined}
                aria-disabled={locked || undefined}
                aria-selected={
                  selectionMode === "single" || selectionMode === "multiple"
                    ? isSelected
                    : undefined
                }
                aria-checked={
                  selectionMode === "checkbox"
                    ? checked.mixed
                      ? "mixed"
                      : checked.checked
                    : undefined
                }
                tabIndex={node.id === activeId ? 0 : -1}
                className="min-w-0 list-none rounded-sm outline-none focus-visible:[&>div]:outline-2 focus-visible:[&>div]:-outline-offset-2 focus-visible:[&>div]:outline-ring"
                onFocus={(event) => {
                  if (event.target === event.currentTarget)
                    rememberFocus(node.id);
                }}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.defaultPrevented) return;
                  const index = visible.indexOf(node.id);
                  if (
                    [
                      "ArrowDown",
                      "ArrowUp",
                      "ArrowRight",
                      "ArrowLeft",
                      "Home",
                      "End",
                      "Enter",
                      " ",
                    ].includes(event.key)
                  )
                    event.preventDefault();
                  switch (event.key) {
                    case "ArrowDown":
                      focus(visible[index + 1]);
                      break;
                    case "ArrowUp":
                      focus(visible[index - 1]);
                      break;
                    case "Home":
                      focus(visible[0]);
                      break;
                    case "End":
                      focus(visible.at(-1));
                      break;
                    case "ArrowRight":
                      if (hasChildren) {
                        if (!open) toggleExpanded(node.id);
                        else focus(visible[index + 1]);
                      }
                      break;
                    case "ArrowLeft":
                      if (open && !query) toggleExpanded(node.id);
                      else focus(entry.parentId ?? undefined);
                      break;
                    case "Enter":
                      if (selectionMode === "none") toggleExpanded(node.id);
                      else select(node.id);
                      break;
                    case " ":
                      select(node.id);
                      break;
                    default:
                      if (
                        event.key.length === 1 &&
                        !event.ctrlKey &&
                        !event.metaKey &&
                        !event.altKey
                      ) {
                        const now = Date.now();
                        const text =
                          (now - typeahead.current.time < 700
                            ? typeahead.current.text
                            : "") + event.key.toLowerCase();
                        typeahead.current = { text, time: now };
                        const match = [
                          ...visible.slice(index + 1),
                          ...visible.slice(0, index + 1),
                        ].find((key) =>
                          entries
                            .get(key)!
                            .node.label.toLowerCase()
                            .startsWith(text),
                        );
                        focus(match);
                      }
                  }
                }}
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
                    )
                      return;
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
                          if (element) element.indeterminate = checked.mixed;
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
                {open && render(node.children ?? [])}
              </li>
            );
          })}
      </ul>
    );
  }
  return (
    <div
      {...props}
      data-slot="tree"
      className={cn(treeVariants({ size: size ?? "md" }), className)}
      onFocusCapture={(event) => {
        hadFocus.current =
          !!(event.target as HTMLElement).closest('[role="treeitem"]') &&
          event.target ===
            (event.target as HTMLElement).closest('[role="treeitem"]');
        onFocusCapture?.(event);
      }}
      onBlurCapture={(event) => {
        if (event.relatedTarget) hadFocus.current = false;
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
            if (filterValue === undefined) setFilter(event.target.value);
            onFilterChange?.(event.target.value);
          }}
        />
      )}
      {visible.length ? (
        <div className="overflow-x-auto">{render(nodes, true)}</div>
      ) : (
        <EmptyState size={size}>
          <EmptyStateTitle>{emptyMessage}</EmptyStateTitle>
        </EmptyState>
      )}
    </div>
  );
}
