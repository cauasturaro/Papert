import type { KeyboardEvent, MouseEvent as ReactMouseEvent } from "react";

const CONTEXT_TRIGGER = '[data-slot="context-menu-trigger"]';

function openContextMenu(
  trigger: HTMLElement,
  clientX: number,
  clientY: number,
) {
  trigger.dispatchEvent(
    new MouseEvent("contextmenu", {
      clientX,
      clientY,
      bubbles: true,
      cancelable: true,
    }),
  );
}

/** A right-click anywhere on a row opens that row's context menu at the pointer. */
export function forwardRowContextMenu(event: ReactMouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  const row = target.closest<HTMLElement>("[data-tree-row]");
  const trigger = row?.querySelector<HTMLElement>(CONTEXT_TRIGGER);

  if (trigger && !trigger.contains(target)) {
    event.preventDefault();
    openContextMenu(trigger, event.clientX, event.clientY);
  }
}

export function isMenuShortcut(event: KeyboardEvent<HTMLElement>) {
  return (
    !event.defaultPrevented &&
    (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
  );
}

/** The item a menu shortcut was pressed on, by its tree id. */
export function shortcutItemId(event: KeyboardEvent<HTMLElement>) {
  const target = event.target as HTMLElement;

  return target.closest<HTMLElement>("[data-tree-id]")?.dataset.treeId;
}

/**
 * Opens the focused item's actions from the keyboard: its row menu button when shown,
 * otherwise its context menu placed under the row.
 */
export function openItemMenu(
  event: KeyboardEvent<HTMLElement>,
  allowContextMenu: boolean,
) {
  const target = event.target as HTMLElement;
  const treeItem = target.closest<HTMLElement>("[data-tree-id]");
  const button = treeItem?.querySelector<HTMLButtonElement>(
    'button[aria-haspopup="menu"]',
  );

  if (button) {
    event.preventDefault();

    // Menu triggers open on pointer down; a synthetic click alone does nothing.
    button.dispatchEvent(
      new PointerEvent("pointerdown", {
        button: 0,
        bubbles: true,
        cancelable: true,
      }),
    );
    return;
  }

  const trigger = treeItem?.querySelector<HTMLElement>(CONTEXT_TRIGGER);

  if (trigger && allowContextMenu) {
    event.preventDefault();
    const rect = treeItem!
      .querySelector("[data-tree-row]")!
      .getBoundingClientRect();
    openContextMenu(trigger, rect.left + 16, rect.bottom);
  }
}
