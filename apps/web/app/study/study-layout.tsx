"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Separator } from "@/components/ui/separator/separator";
import { FlagIcon, SparklesIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { PanelRail } from "./side-panel-controls";
import type { CollapsedPanels, SidePanel } from "./use-collapsed-panels";

type Panel = "challenge" | "files" | "editor" | "seymour";

const mobilePanels: { value: Panel; label: string }[] = [
  { value: "challenge", label: "Challenge" },
  { value: "files", label: "Files" },
  { value: "editor", label: "Editor" },
  { value: "seymour", label: "Seymour" },
];

type StudyLayoutProps = {
  challenge: ReactNode;
  explorer: ReactNode;
  editor: ReactNode;
  analysis: ReactNode;
  seymour: ReactNode;
  collapsed: CollapsedPanels;
  onExpand: (panel: SidePanel) => void;
};

// Overrides the inline flex sizes the resize handles write while collapsed.
const railClasses = "lg:flex-[0_0_2.5rem]! lg:min-w-10! lg:max-w-10!";

function VerticalHandle({ label }: { label: string }) {
  return (
    <Separator
      draggable
      orientation="vertical"
      aria-label={label}
      className="w-2 max-lg:hidden"
    />
  );
}

/**
 * Desktop: resizable columns built from nested two-panel groups, the only
 * shape the draggable Separator supports:
 * [challenge | [[explorer | [editor / analysis]] | seymour]].
 * Challenge and Seymour can collapse into rails on desktop; their content
 * stays mounted while hidden. Below 1024 px one panel is shown at a time. Each panel is mounted once in
 * both layouts so Monaco and live connections are never duplicated.
 */
export function StudyLayout({
  challenge,
  explorer,
  editor,
  analysis,
  seymour,
  collapsed,
  onExpand,
}: StudyLayoutProps) {
  const [panel, setPanel] = useState<Panel>("editor");
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(collapsed);

  // The pressed control disappears on toggle, so move focus to its counterpart.
  useEffect(() => {
    const sides = { challenge: "left", seymour: "right" } as const;

    for (const name of ["challenge", "seymour"] as const) {
      if (previous.current[name] === collapsed[name]) {
        continue;
      }

      const target = collapsed[name]
        ? `[data-panel-rail="${sides[name]}"]`
        : `[data-panel-toggle="${sides[name]}"]`;

      root.current?.querySelector<HTMLElement>(target)?.focus();
    }

    previous.current = collapsed;
  }, [collapsed]);

  const mobileHidden = (...visibleFor: Panel[]) =>
    visibleFor.includes(panel) ? "" : "max-lg:hidden";

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      <nav
        aria-label="Workspace panels"
        className="flex shrink-0 gap-1 border-b border-border bg-card p-1 lg:hidden"
      >
        {mobilePanels.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={panel === value}
            onClick={() => setPanel(value)}
            className={cn(
              "flex-1 rounded-sm px-2 py-1.5 text-sm font-medium text-muted-foreground",
              panel === value && "bg-accent text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1 bg-border/40 p-1.5 max-lg:p-0">
        <div
          className={cn(
            "panel-surface min-w-0 flex-[22_1_0%] lg:min-w-[240px] lg:max-w-[45%]",
            collapsed.challenge && railClasses,
            mobileHidden("challenge"),
          )}
        >
          {collapsed.challenge && (
            <div className="hidden h-full lg:block">
              <PanelRail
                side="left"
                label="Challenge"
                icon={FlagIcon}
                controls="study-challenge-panel"
                onExpand={() => onExpand("challenge")}
              />
            </div>
          )}

          <div
            id="study-challenge-panel"
            className={cn("h-full", collapsed.challenge && "lg:hidden")}
          >
            {challenge}
          </div>
        </div>

        {!collapsed.challenge && (
          <VerticalHandle label="Resize challenge panel" />
        )}

        <div
          className={cn(
            "flex min-w-0 flex-[78_1_0%]",
            mobileHidden("files", "editor", "seymour"),
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-[70_1_0%] lg:min-w-[420px]",
              mobileHidden("files", "editor"),
            )}
          >
            <div
              className={cn(
                "panel-surface min-w-0 flex-[28_1_0%] lg:min-w-[200px] lg:max-w-[45%]",
                mobileHidden("files"),
              )}
            >
              {explorer}
            </div>

            <VerticalHandle label="Resize file explorer" />

            <div
              className={cn(
                "flex min-w-0 flex-[72_1_0%] flex-col",
                mobileHidden("editor"),
              )}
            >
              <div className="panel-surface min-h-[160px] flex-[72_1_0%]">
                {editor}
              </div>

              <Separator
                draggable
                orientation="horizontal"
                aria-label="Resize analysis panel"
                className="h-2"
              />

              <div className="panel-surface min-h-[96px] flex-[28_1_0%]">
                {analysis}
              </div>
            </div>
          </div>

          {!collapsed.seymour && (
            <VerticalHandle label="Resize Seymour panel" />
          )}

          <div
            className={cn(
              "panel-surface min-w-0 flex-[30_1_0%] lg:min-w-[260px] lg:max-w-[50%]",
              collapsed.seymour && railClasses,
              mobileHidden("seymour"),
            )}
          >
            {collapsed.seymour && (
              <div className="hidden h-full lg:block">
                <PanelRail
                  side="right"
                  label="Seymour"
                  icon={SparklesIcon}
                  controls="study-seymour-panel"
                  onExpand={() => onExpand("seymour")}
                />
              </div>
            )}

            <div
              id="study-seymour-panel"
              className={cn("h-full", collapsed.seymour && "lg:hidden")}
            >
              {seymour}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
