"use client";

import type { ComponentType } from "react";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip/tooltip";
import { PanelLeftIcon, PanelRightIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

type Side = "left" | "right";

const sideIcons: Record<Side, ComponentType<{ className?: string }>> = {
  left: PanelLeftIcon,
  right: PanelRightIcon,
};

/** Header button that collapses a side panel into its rail (desktop only). */
export function CollapsePanelButton({
  side,
  label,
  onCollapse,
  panel,
}: {
  side: Side;
  label: string;
  onCollapse: () => void;
  // Focus target name when two panels share a side; defaults to the side.
  panel?: string;
}) {
  const Icon = sideIcons[side];

  return (
    <Tooltip content={`Hide ${label}`} side="bottom" className="max-lg:hidden">
      <TooltipTrigger
        variant="ghost"
        size="sm"
        iconOnly
        className="size-7"
        aria-label={`Hide ${label}`}
        data-panel-toggle={panel ?? side}
        onClick={onCollapse}
      >
        <Icon />
      </TooltipTrigger>
    </Tooltip>
  );
}

/**
 * Slim vertical stripe shown in place of a collapsed panel. The whole stripe
 * is one button; the left label reads bottom-to-top and the right one
 * top-to-bottom, like editor tool-window stripes.
 */
export function PanelRail({
  side,
  label,
  icon: Icon,
  controls,
  onExpand,
  panel,
}: {
  side: Side;
  label: string;
  icon: ComponentType<{ className?: string }>;
  controls: string;
  onExpand: () => void;
  panel?: string;
}) {
  const ExpandIcon = sideIcons[side === "left" ? "right" : "left"];

  return (
    <button
      type="button"
      aria-expanded={false}
      aria-controls={controls}
      aria-label={`Show ${label}`}
      data-panel-rail={panel ?? side}
      onClick={onExpand}
      className="group flex h-full w-full flex-col items-center gap-4 py-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-offset-[-3px]"
    >
      <span className="flex size-7 items-center justify-center rounded-md transition-colors group-hover:bg-background">
        <ExpandIcon className="size-4" />
      </span>

      <span
        className={cn(
          "flex items-center gap-2 text-xs font-semibold tracking-wider uppercase [writing-mode:vertical-rl]",
          side === "left" && "rotate-180",
        )}
      >
        <Icon className="size-4 text-ring" />
        {label}
      </span>
    </button>
  );
}
