"use client";

import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { getTreeCheckStates, type TreeNode } from "./tree-model";
import { getVisibleTree } from "./tree-visible";
import type { TreeProps } from "./tree";

export function useTreeNavigation<T>({
  nodes = [],
  selectionMode = "none",
  selectedIds,
  defaultSelectedIds = [],
  onSelectionChange,
  expandedIds,
  defaultExpandedIds = [],
  onExpandedChange,
  filterValue,
  defaultFilterValue = "",
  disabled = false,
}: TreeProps<T>) {
  const id = useId();
  const [localSelected, setSelected] =
    useState<readonly string[]>(defaultSelectedIds);
  const [localExpanded, setExpanded] =
    useState<readonly string[]>(defaultExpandedIds);
  const [localFilter, setFilter] = useState(defaultFilterValue);
  const [focusPath, setFocusPath] = useState<string[]>([]);
  const items = useRef(new Map<string, HTMLLIElement>());
  const hadFocusRef = useRef(false);
  const typeahead = useRef({ text: "", time: 0 });
  const selected = selectedIds ?? localSelected;
  const expanded = new Set(expandedIds ?? localExpanded);
  const query = (filterValue ?? localFilter)
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const checks = getTreeCheckStates(nodes, selected);
  const { entries, shown, visible } = getVisibleTree(nodes, expanded, query);
  const activeId =
    focusPath.find((key) => visible.includes(key)) ??
    visible.find((key) => selected.includes(key)) ??
    visible[0] ??
    null;
  useLayoutEffect(() => {
    if (hadFocusRef.current && activeId) {
      items.current.get(activeId)?.focus();
    }
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
    if (!key) {
      return;
    }
    rememberFocus(key);
    items.current.get(key)?.focus();
  }

  function toggleExpanded(key: string) {
    if (
      disabled ||
      entries.get(key)?.disabled ||
      !entries.get(key)?.node.children?.length ||
      query
    ) {
      return;
    }
    const next = new Set(expanded);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    if (expandedIds === undefined) {
      setExpanded([...next]);
    }
    onExpandedChange?.([...next]);
  }

  function select(key: string) {
    if (disabled || entries.get(key)?.disabled || selectionMode === "none") {
      return;
    }
    let next: string[];
    if (selectionMode === "single") {
      next = [key];
    } else if (selectionMode === "multiple") {
      next = selected.includes(key)
        ? selected.filter((id) => id !== key)
        : [...selected, key];
    } else {
      const nextIds = new Set(selected);
      const checked = checks.get(key)?.checked;
      function toggle(node: TreeNode<T>) {
        if (entries.get(node.id)?.disabled) {
          return;
        }
        if (checked) {
          nextIds.delete(node.id);
        } else {
          nextIds.add(node.id);
        }
        node.children?.forEach(toggle);
      }
      toggle(entries.get(key)!.node);
      const normalized = getTreeCheckStates(nodes, [...nextIds]);
      next = [...normalized]
        .filter(([, state]) => state.checked)
        .map(([id]) => id);
    }
    if (selectedIds === undefined) {
      setSelected(next);
    }
    onSelectionChange?.(next);
  }

  function onItemKeyDown(event: KeyboardEvent<HTMLLIElement>, node: TreeNode<T>) {
    const entry = entries.get(node.id)!;
    const hasChildren = !!node.children?.length;
    const open = hasChildren && (!!query || expanded.has(node.id));
    if (event.target !== event.currentTarget) {
      return;
    }
    if (event.defaultPrevented) {
      return;
    }
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
    ) {
      event.preventDefault();
    }
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
          if (!open) {
            toggleExpanded(node.id);
          } else {
            focus(visible[index + 1]);
          }
        }
        break;
      case "ArrowLeft":
        if (open && !query) {
          toggleExpanded(node.id);
        } else {
          focus(entry.parentId ?? undefined);
        }
        break;
      case "Enter":
        if (selectionMode === "none") {
          toggleExpanded(node.id);
        } else {
          select(node.id);
        }
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
  }

  return {
    id,
    localFilter,
    setFilter,
    hadFocusRef,
    items,
    selected,
    expanded,
    query,
    entries,
    checks,
    shown,
    visible,
    activeId,
    rememberFocus,
    focus,
    toggleExpanded,
    select,
    onItemKeyDown,
  };
}
