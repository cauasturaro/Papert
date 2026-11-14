"use client";

import Link from "next/link";
import { Navbar } from "@/components/app/navbar";
import { Badge, type BadgeProps } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip/tooltip";
import {
  ChevronRightIcon,
  DownloadIcon,
  SparklesIcon,
} from "@/components/icons";
import { ariaKeyShortcut } from "@/lib/keyboard/shortcut";
import { useShortcutLabel } from "@/lib/keyboard/use-shortcuts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu/dropdown-menu";
import { StreakChip } from "../../profile/streak-chip";
import type { Workspace } from "../study-api";
import { useNow } from "../use-now";
import { workspaceHref } from "../use-study";
import {
  compactSaveLabel,
  saveLabel,
  saveTone,
  type SaveFailure,
  type SaveState,
  type SaveTone,
} from "../workspace/save-state";

type Step = Workspace["roadmap"]["definition"]["steps"][number];

type StudyNavbarProps = {
  workspace: Workspace;
  step: Step | undefined;
  saveState: SaveState;
  savedAt: number | null;
  failure: SaveFailure | null;
  saveBlocked: boolean;
  analyzing: boolean;
  // False while a check runs or waits, and after the roadmap is complete.
  canAnalyze: boolean;
  roadmapCompleted: boolean;
  onDownload: () => void;
  onSave: () => void;
  onAnalyze: () => void;
};

const badgeVariants: Record<SaveTone, BadgeProps["variant"]> = {
  success: "success",
  neutral: "outline",
  warning: "warning",
  destructive: "destructive",
};

function SaveIndicator({
  workspace,
  saveState,
  savedAt,
  failure,
}: Pick<StudyNavbarProps, "workspace" | "saveState" | "savedAt" | "failure">) {
  let interval: number | null = null;

  if (saveState === "retrying") {
    interval = 1000;
  } else if (saveState === "saved" && savedAt !== null) {
    interval = 30_000;
  }

  const now = useNow(interval);
  const tone = saveTone(saveState);
  const label = saveLabel(saveState, {
    savedAt,
    retryAt: failure?.retryAt,
    now,
  });

  // The revision number is useful only for support, so it stays in the tooltip.
  const details = [failure?.message, `Saved version ${workspace.revision}`]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <Badge
        size="sm"
        variant={badgeVariants[tone]}
        className="max-md:hidden"
        title={details}
      >
        {label}
      </Badge>

      <Badge
        size="sm"
        variant={badgeVariants[tone]}
        className="md:hidden"
        title={label}
      >
        {compactSaveLabel(saveState)}
      </Badge>
    </>
  );
}

// Why "Check my solution" is unavailable, or null when the reason is already visible.
function analyzeBlockedReason({
  roadmapCompleted,
  saveBlocked,
}: Pick<StudyNavbarProps, "roadmapCompleted" | "saveBlocked">) {
  if (roadmapCompleted) {
    return "You completed this roadmap, so there is nothing left to check.";
  }

  if (saveBlocked) {
    return "Your changes cannot be saved right now. Check the message below the toolbar.";
  }

  return null;
}

export function StudyNavbar(props: StudyNavbarProps) {
  const { workspace, step, saveBlocked, analyzing } = props;
  const saveShortcut = useShortcutLabel("Mod+S");
  const analyzeShortcut = useShortcutLabel("Mod+Enter");

  const analyzeDisabled = saveBlocked || !props.canAnalyze;
  const blockedReason = analyzeDisabled ? analyzeBlockedReason(props) : null;
  const analyzeTitle =
    blockedReason ?? `Check my solution (${analyzeShortcut})`;

  const actions = (
    <>
      <StreakChip className="max-md:hidden" />

      <SaveIndicator
        workspace={workspace}
        saveState={props.saveState}
        savedAt={props.savedAt}
        failure={props.failure}
      />

      <Tooltip
        content="Download my files"
        side="bottom"
        className="max-sm:hidden"
      >
        <TooltipTrigger
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Download my files"
          onClick={props.onDownload}
        >
          <DownloadIcon />
        </TooltipTrigger>
      </Tooltip>

      <Button
        className="max-sm:hidden"
        size="sm"
        variant="outline"
        disabled={saveBlocked}
        title={`Save all (${saveShortcut})`}
        aria-keyshortcuts={ariaKeyShortcut("Mod+S")}
        onClick={props.onSave}
      >
        Save
      </Button>

      <DropdownMenu size="sm" className="sm:hidden">
        <DropdownMenuTrigger
          variant="ghost"
          iconOnly
          aria-label="Workspace actions"
        >
          <span aria-hidden="true">⋯</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={props.onDownload}>
            <DownloadIcon />
            Download my files
          </DropdownMenuItem>
          <DropdownMenuItem disabled={saveBlocked} onSelect={props.onSave}>
            Save
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        size="sm"
        disabled={analyzeDisabled}
        title={analyzeTitle}
        aria-keyshortcuts={ariaKeyShortcut("Mod+Enter")}
        aria-describedby={blockedReason ? "analyze-blocked-reason" : undefined}
        onClick={props.onAnalyze}
      >
        <SparklesIcon />
        {/* Phones keep the icon; the label stays available to screen readers. */}
        <span className="max-sm:sr-only">
          {analyzing ? "Checking…" : "Check my solution"}
        </span>
      </Button>

      {blockedReason && (
        <span id="analyze-blocked-reason" className="sr-only">
          {blockedReason}
        </span>
      )}
    </>
  );

  return (
    <Navbar
      skipLink={false}
      actions={actions}
      className="max-sm:gap-1 max-sm:px-2"
    >
      <nav
        aria-label="Breadcrumb"
        className="min-w-0 text-sm text-muted-foreground max-sm:hidden"
      >
        <ol className="flex min-w-0 items-center gap-1.5">
          <li className="flex shrink-0 items-center gap-1.5">
            <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />
            <Link href="/study" className="rounded-sm hover:text-foreground">
              Study
            </Link>
          </li>

          <li className="flex min-w-0 items-center gap-1.5">
            <ChevronRightIcon className="size-4 shrink-0" aria-hidden="true" />
            <Link
              href={workspaceHref(workspace.id)}
              className="truncate rounded-sm hover:text-foreground"
            >
              {workspace.roadmap.definition.title}
            </Link>
          </li>

          {step && (
            <li className="flex min-w-0 items-center gap-1.5">
              <ChevronRightIcon
                className="size-4 shrink-0"
                aria-hidden="true"
              />
              <span
                aria-current="page"
                className="truncate font-medium text-foreground"
              >
                {step.title}
              </span>
            </li>
          )}
        </ol>
      </nav>
    </Navbar>
  );
}
