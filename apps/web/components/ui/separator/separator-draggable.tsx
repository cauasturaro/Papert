"use client";

import { useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { SeparatorProps } from "./separator";

function getPanels(element: HTMLDivElement, vertical: boolean) {
  const parent = element.parentElement;
  const before = element.previousElementSibling;
  const after = element.nextElementSibling;
  if (
    !parent ||
    !(before instanceof HTMLElement) ||
    !(after instanceof HTMLElement)
  )
    return;
  const layout = getComputedStyle(parent);
  // shortcut: two panels per group; extend the calculation for more sibling panels.
  if (
    !layout.display.includes("flex") ||
    layout.flexWrap !== "nowrap" ||
    parent.children.length !== 3 ||
    layout.flexDirection.startsWith("column") === vertical
  )
    return;
  const first = before.getBoundingClientRect();
  const second = after.getBoundingClientRect();
  const size = vertical ? first.width : first.height;
  const total = size + (vertical ? second.width : second.height);
  if (total <= 0) return;
  return {
    before,
    after,
    size,
    total,
    direction: (vertical ? first.left <= second.left : first.top <= second.top)
      ? 1
      : -1,
  };
}

type Drag = {
  pointerId: number;
  origin: number;
  size: number;
  total: number;
  direction: number;
  before: HTMLElement;
  after: HTMLElement;
  beforeFlex: Pick<
    CSSStyleDeclaration,
    "flexGrow" | "flexShrink" | "flexBasis"
  >;
  afterFlex: Pick<CSSStyleDeclaration, "flexGrow" | "flexShrink" | "flexBasis">;
};

function restoreFlex(current: Drag) {
  Object.assign(current.before.style, current.beforeFlex);
  Object.assign(current.after.style, current.afterFlex);
}

export function DraggableSeparator({
  orientation,
  ref,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onKeyDown,
  "aria-label": ariaLabel,
  ...props
}: Omit<SeparatorProps, "decorative" | "draggable" | "orientation"> & {
  orientation: "horizontal" | "vertical";
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [resizing, setResizing] = useState(false);
  const [value, setValue] = useState(50);
  const [controls, setControls] = useState<string>();
  const id = useId();
  const vertical = orientation === "vertical";
  useImperativeHandle(ref, () => root.current!, []);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const panels = getPanels(element, vertical);
    if (!panels) return;
    const assigned: HTMLElement[] = [];
    for (const [panel, suffix] of [
      [panels.before, "before"],
      [panels.after, "after"],
    ] as const) {
      if (!panel.id) {
        panel.id = `${id}-${suffix}`;
        assigned.push(panel);
      }
    }
    setControls(`${panels.before.id} ${panels.after.id}`);
    function measure() {
      const current = getPanels(element!, vertical);
      if (current) setValue(Math.round((current.size / current.total) * 100));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panels.before);
    observer.observe(panels.after);
    return () => {
      observer.disconnect();
      for (const panel of assigned)
        if (panel.id === `${id}-before` || panel.id === `${id}-after`)
          panel.removeAttribute("id");
      const current = drag.current;
      if (current) {
        restoreFlex(current);
        drag.current = null;
      }
    };
  }, [id, vertical]);

  function resize(before: HTMLElement, after: HTMLElement, percent: number) {
    const bounded = Math.max(0, Math.min(100, percent));
    // Flex distributes the space and respects CSS min/max set on the panels.
    const beforeStyle = getComputedStyle(before);
    const afterStyle = getComputedStyle(after);
    const edges = vertical
      ? ([
          "paddingLeft",
          "paddingRight",
          "borderLeftWidth",
          "borderRightWidth",
        ] as const)
      : ([
          "paddingTop",
          "paddingBottom",
          "borderTopWidth",
          "borderBottomWidth",
        ] as const);
    const beforeEdges = edges.reduce(
      (sum, edge) => sum + parseFloat(beforeStyle[edge]),
      0,
    );
    const afterEdges = edges.reduce(
      (sum, edge) => sum + parseFloat(afterStyle[edge]),
      0,
    );
    const total = vertical
      ? before.getBoundingClientRect().width +
        after.getBoundingClientRect().width
      : before.getBoundingClientRect().height +
        after.getBoundingClientRect().height;
    before.style.flex = `${Math.max(0, (total * bounded) / 100 - beforeEdges)} 1 0px`;
    after.style.flex = `${Math.max(0, (total * (100 - bounded)) / 100 - afterEdges)} 1 0px`;
    const panels = root.current && getPanels(root.current, vertical);
    if (panels) setValue(Math.round((panels.size / panels.total) * 100));
  }

  function finish(cancel = false) {
    const current = drag.current;
    if (!current) return;
    drag.current = null;
    if (cancel) {
      restoreFlex(current);
    }
    const element = root.current;
    if (element?.hasPointerCapture(current.pointerId))
      element.releasePointerCapture(current.pointerId);
    setResizing(false);
    const panels = element && getPanels(element, vertical);
    if (panels) setValue(Math.round((panels.size / panels.total) * 100));
  }

  return (
    <div
      {...props}
      ref={root}
      draggable={false}
      data-slot="separator"
      data-draggable="true"
      data-resizing={resizing || undefined}
      role="separator"
      tabIndex={0}
      aria-hidden={undefined}
      aria-label={ariaLabel ?? "Resize panels"}
      aria-orientation={orientation}
      aria-controls={controls}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          !event.isPrimary ||
          drag.current
        )
          return;
        const panels = getPanels(event.currentTarget, vertical);
        if (!panels) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = {
          ...panels,
          pointerId: event.pointerId,
          origin: vertical ? event.clientX : event.clientY,
          beforeFlex: {
            flexGrow: panels.before.style.flexGrow,
            flexShrink: panels.before.style.flexShrink,
            flexBasis: panels.before.style.flexBasis,
          },
          afterFlex: {
            flexGrow: panels.after.style.flexGrow,
            flexShrink: panels.after.style.flexShrink,
            flexBasis: panels.after.style.flexBasis,
          },
        };
        setResizing(true);
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        const current = drag.current;
        if (
          event.defaultPrevented ||
          !current ||
          current.pointerId !== event.pointerId
        )
          return;
        const delta =
          ((vertical ? event.clientX : event.clientY) - current.origin) *
          current.direction;
        resize(
          current.before,
          current.after,
          ((current.size + delta) / current.total) * 100,
        );
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        if (event.pointerId === drag.current?.pointerId) finish();
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event);
        if (event.pointerId === drag.current?.pointerId) finish(true);
      }}
      onLostPointerCapture={(event) => {
        onLostPointerCapture?.(event);
        if (event.pointerId === drag.current?.pointerId) finish();
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Escape" && drag.current) {
          event.preventDefault();
          finish(true);
          return;
        }
        const panels = getPanels(event.currentTarget, vertical);
        if (!panels) return;
        const step = event.shiftKey ? 10 : 5;
        const increase = vertical ? "ArrowRight" : "ArrowDown";
        const decrease = vertical ? "ArrowLeft" : "ArrowUp";
        let next = (panels.size / panels.total) * 100;
        if (event.key === "Home") next = 0;
        else if (event.key === "End") next = 100;
        else if (event.key === increase) next += step * panels.direction;
        else if (event.key === decrease) next -= step * panels.direction;
        else return;
        event.preventDefault();
        resize(panels.before, panels.after, next);
      }}
    >
      <span
        aria-hidden="true"
        className={
          vertical
            ? "z-1 h-8 w-1 rounded-full bg-input forced-colors:bg-[CanvasText]"
            : "z-1 h-1 w-8 rounded-full bg-input forced-colors:bg-[CanvasText]"
        }
      />
    </div>
  );
}
