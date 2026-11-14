"use client";

import { useEffect, useRef } from "react";
import { Separator } from "@/components/ui/separator/separator";
import { cn } from "@/lib/utils";

const storageKey = "papert:study-panel-sizes";

type Sizes = Record<string, [number, number]>;

function readSizes(): Sizes {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) ?? "{}");

    return stored && typeof stored === "object" ? stored : {};
  } catch {
    return {};
  }
}

function grow(element: Element | null) {
  if (!(element instanceof HTMLElement)) {
    return null;
  }

  const value = parseFloat(element.style.flexGrow);

  return Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * A draggable separator whose split is remembered per browser. The separator writes
 * flex sizes on its two neighbours; their ratio is stored after each resize and applied
 * again when the layout mounts.
 */
export function PersistedHandle({
  id,
  label,
  orientation,
  className,
}: {
  id: string;
  label: string;
  orientation: "vertical" | "horizontal";
  className?: string;
}) {
  const handle = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = handle.current;
    const stored = readSizes()[id];

    if (!element || !stored) {
      return;
    }

    const [before, after] = stored;
    const previous = element.previousElementSibling;
    const next = element.nextElementSibling;

    if (previous instanceof HTMLElement && next instanceof HTMLElement) {
      previous.style.flex = `${before} 1 0px`;
      next.style.flex = `${after} 1 0px`;
    }
  }, [id]);

  function remember() {
    // The separator updates its neighbours after this handler runs.
    requestAnimationFrame(() => {
      const element = handle.current;
      const before = grow(element?.previousElementSibling ?? null);
      const after = grow(element?.nextElementSibling ?? null);

      if (before === null || after === null) {
        return;
      }

      try {
        const sizes = { ...readSizes(), [id]: [before, after] };
        localStorage.setItem(storageKey, JSON.stringify(sizes));
      } catch {
        // The size still applies to this page view.
      }
    });
  }

  return (
    <Separator
      ref={handle}
      draggable
      orientation={orientation}
      aria-label={label}
      className={cn(orientation === "vertical" ? "w-2" : "h-2", className)}
      onPointerUp={remember}
      onKeyUp={remember}
    />
  );
}
