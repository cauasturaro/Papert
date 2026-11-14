"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import { PanelErrorBoundary } from "@/components/ui/error-panel/error-panel";
import { FlagIcon, FolderIcon, SparklesIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { PanelRail } from "./side-panel-controls";
import { useMediaQuery } from "../use-browser-session";
import type { CollapsedPanels, SidePanel } from "./use-collapsed-panels";
import { PersistedHandle } from "../workspace/persisted-handle";

export type MobilePanel =
  "challenge" | "editor" | "analysis" | "seymour" | "files";

const mobilePanels: { value: MobilePanel; label: string }[] = [
  { value: "challenge", label: "Challenge" },
  { value: "editor", label: "Editor" },
  { value: "analysis", label: "Analysis" },
  { value: "seymour", label: "Seymour" },
  { value: "files", label: "Files" },
];

// Columns need both width and height; otherwise panels stack and the page scrolls (WCAG 1.4.10).
const COLUMNS_QUERY = "(min-width: 1024px) and (min-height: 600px)";

// Overrides the inline flex sizes the resize handles write while collapsed.
const railClasses = "flex-[0_0_2.5rem]! min-w-10! max-w-10!";

// Rail and header button of each collapsible panel share this name for focus handoff.
const focusNames: Record<SidePanel, string> = {
  challenge: "left",
  explorer: "explorer",
  seymour: "right",
};

type StudyLayoutProps = {
  challenge: ReactNode;
  explorer: ReactNode;
  editor: ReactNode;
  analysis: ReactNode;
  seymour: ReactNode;
  collapsed: CollapsedPanels;
  onExpand: (panel: SidePanel) => void;
  mobilePanel: MobilePanel;
  onMobilePanelChange: (panel: MobilePanel) => void;
  // Short screen reader text per switcher tab, such as "unsaved changes"; shown as a dot.
  badges: Partial<Record<MobilePanel, string>>;
};

function MobileTabs({
  panel,
  badges,
  onChange,
}: {
  panel: MobilePanel;
  badges: StudyLayoutProps["badges"];
  onChange: (panel: MobilePanel) => void;
}) {
  const list = useRef<HTMLDivElement>(null);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    const index = mobilePanels.findIndex(({ value }) => value === panel);
    let next = index;

    if (event.key === "ArrowRight") {
      next = (index + 1) % mobilePanels.length;
    } else if (event.key === "ArrowLeft") {
      next = (index - 1 + mobilePanels.length) % mobilePanels.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = mobilePanels.length - 1;
    } else {
      return;
    }

    event.preventDefault();

    const value = mobilePanels[next].value;
    onChange(value);
    list.current
      ?.querySelector<HTMLButtonElement>(`#study-tab-${value}`)
      ?.focus();
  }

  return (
    <div
      ref={list}
      role="tablist"
      aria-label="Workspace panels"
      className="flex shrink-0 gap-1 overflow-x-auto border-b border-border bg-card p-1"
      onKeyDown={moveFocus}
    >
      {mobilePanels.map(({ value, label }) => {
        const selected = panel === value;
        const badge = badges[value];

        return (
          <button
            key={value}
            id={`study-tab-${value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`study-panel-${value}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(value)}
            className={cn(
              "relative flex flex-1 items-center justify-center gap-1.5 rounded-sm px-2 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground",
              selected && "bg-accent text-foreground",
            )}
          >
            {label}

            {badge && (
              <>
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-ring"
                />
                <span className="sr-only">, {badge}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Wide screens: resizable columns built from nested two-panel groups, the only shape the
 * draggable Separator supports: [challenge | [[explorer | [editor / analysis]] | seymour]].
 * Challenge, Files and Seymour collapse into rails; their content stays mounted. Narrow or
 * short screens show one panel at a time under a tab switcher and scroll instead of
 * clipping. Each panel is mounted once in both modes so Monaco and live connections are
 * never duplicated, and each has its own error boundary.
 */
export function StudyLayout({
  challenge,
  explorer,
  editor,
  analysis,
  seymour,
  collapsed,
  onExpand,
  mobilePanel,
  onMobilePanelChange,
  badges,
}: StudyLayoutProps) {
  const columns = useMediaQuery(COLUMNS_QUERY);
  const root = useRef<HTMLDivElement>(null);
  const previous = useRef(collapsed);

  // The pressed control disappears on toggle, so move focus to its counterpart.
  useEffect(() => {
    for (const name of ["challenge", "explorer", "seymour"] as const) {
      if (previous.current[name] === collapsed[name]) {
        continue;
      }

      const focusName = focusNames[name];
      const target = collapsed[name]
        ? `[data-panel-rail="${focusName}"]`
        : `[data-panel-toggle="${focusName}"]`;

      root.current?.querySelector<HTMLElement>(target)?.focus();
    }

    previous.current = collapsed;
  }, [collapsed]);

  // In stacked mode a group shows only when it holds the selected panel.
  const shown = (...panels: MobilePanel[]) =>
    columns || panels.includes(mobilePanel);

  const tabPanel = (value: MobilePanel) =>
    columns
      ? { id: `study-panel-${value}` }
      : {
          id: `study-panel-${value}`,
          role: "tabpanel",
          "aria-labelledby": `study-tab-${value}`,
        };

  const isCollapsed = (panel: SidePanel) => columns && collapsed[panel];

  const stackedPanel = "h-full min-h-[28rem]";

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col">
      {!columns && (
        <MobileTabs
          panel={mobilePanel}
          badges={badges}
          onChange={onMobilePanelChange}
        />
      )}

      <div
        className={cn(
          "min-h-0 flex-1",
          columns ? "flex bg-border/40 p-1.5" : "overflow-y-auto",
        )}
      >
        <div
          {...tabPanel("challenge")}
          className={cn(
            "panel-surface min-w-0",
            columns && "flex-[24_1_0%] min-w-[240px] max-w-[45%]",
            !columns && stackedPanel,
            isCollapsed("challenge") && railClasses,
            !shown("challenge") && "hidden",
          )}
        >
          {isCollapsed("challenge") && (
            <PanelRail
              side="left"
              label="Challenge"
              icon={FlagIcon}
              controls="study-challenge-panel"
              onExpand={() => onExpand("challenge")}
            />
          )}

          <div
            id="study-challenge-panel"
            className={cn("h-full", isCollapsed("challenge") && "hidden")}
          >
            <PanelErrorBoundary title="The challenge could not be shown">
              {challenge}
            </PanelErrorBoundary>
          </div>
        </div>

        {columns && !collapsed.challenge && (
          <PersistedHandle
            id="challenge"
            orientation="vertical"
            label="Resize challenge panel"
          />
        )}

        <div
          className={cn(
            "flex min-w-0",
            columns ? "flex-[76_1_0%]" : stackedPanel,
            !shown("files", "editor", "analysis", "seymour") && "hidden",
          )}
        >
          <div
            className={cn(
              "flex min-w-0 flex-[70_1_0%]",
              columns && "min-w-[420px]",
              !shown("files", "editor", "analysis") && "hidden",
            )}
          >
            <div
              {...tabPanel("files")}
              className={cn(
                "panel-surface min-w-0 flex-[22_1_0%]",
                columns && "min-w-[200px] max-w-[45%]",
                isCollapsed("explorer") && railClasses,
                !shown("files") && "hidden",
              )}
            >
              {isCollapsed("explorer") && (
                <PanelRail
                  side="left"
                  panel="explorer"
                  label="Files"
                  icon={FolderIcon}
                  controls="study-explorer-panel"
                  onExpand={() => onExpand("explorer")}
                />
              )}

              <div
                id="study-explorer-panel"
                className={cn("h-full", isCollapsed("explorer") && "hidden")}
              >
                <PanelErrorBoundary title="The file list could not be shown">
                  {explorer}
                </PanelErrorBoundary>
              </div>
            </div>

            {columns && !collapsed.explorer && (
              <PersistedHandle
                id="explorer"
                orientation="vertical"
                label="Resize file explorer"
              />
            )}

            <div
              className={cn(
                "flex min-w-0 flex-[78_1_0%] flex-col",
                !shown("editor", "analysis") && "hidden",
              )}
            >
              <div
                {...tabPanel("editor")}
                className={cn(
                  "panel-surface min-h-[160px] flex-[72_1_0%]",
                  !shown("editor") && "hidden",
                )}
              >
                <PanelErrorBoundary title="The editor stopped working">
                  {editor}
                </PanelErrorBoundary>
              </div>

              {columns && (
                <PersistedHandle
                  id="analysis"
                  orientation="horizontal"
                  label="Resize analysis panel"
                />
              )}

              <div
                {...tabPanel("analysis")}
                className={cn(
                  "panel-surface min-h-[96px] flex-[28_1_0%]",
                  !shown("analysis") && "hidden",
                )}
              >
                <PanelErrorBoundary title="The analysis could not be shown">
                  {analysis}
                </PanelErrorBoundary>
              </div>
            </div>
          </div>

          {columns && !collapsed.seymour && (
            <PersistedHandle
              id="seymour"
              orientation="vertical"
              label="Resize Seymour panel"
            />
          )}

          <div
            {...tabPanel("seymour")}
            className={cn(
              "panel-surface min-w-0 flex-[30_1_0%]",
              columns && "min-w-[260px] max-w-[50%]",
              isCollapsed("seymour") && railClasses,
              !shown("seymour") && "hidden",
            )}
          >
            {isCollapsed("seymour") && (
              <PanelRail
                side="right"
                label="Seymour"
                icon={SparklesIcon}
                controls="study-seymour-panel"
                onExpand={() => onExpand("seymour")}
              />
            )}

            <div
              id="study-seymour-panel"
              className={cn("h-full", isCollapsed("seymour") && "hidden")}
            >
              <PanelErrorBoundary title="Seymour stopped working">
                {seymour}
              </PanelErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
