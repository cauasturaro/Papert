"use client";

import { Navbar } from "@/components/app/navbar";
import { Badge, type BadgeProps } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Tooltip, TooltipTrigger } from "@/components/ui/tooltip/tooltip";
import {
  ChevronRightIcon,
  DownloadIcon,
  SparklesIcon,
} from "@/components/icons";
import type { Workspace } from "./study-api";

type StudyNavbarProps = {
  workspace: Workspace | null;
  status: string;
  online: boolean;
  conflict: boolean;
  analyzing: boolean;
  onDownload: () => void;
  onSave: () => void;
  onAnalyze: () => void;
};

const savedStatuses = ["All changes saved.", "Server version loaded."];

function saveState({
  workspace,
  status,
  online,
  conflict,
}: Pick<StudyNavbarProps, "workspace" | "status" | "online" | "conflict">): {
  label: string;
  variant: BadgeProps["variant"];
} {
  if (conflict) {
    return { label: "Conflict", variant: "destructive" };
  }

  if (!online) {
    return { label: "Offline", variant: "destructive" };
  }

  if (savedStatuses.includes(status)) {
    return {
      label: `Saved · r${workspace?.revision ?? 0}`,
      variant: "success",
    };
  }

  if (status === "Changes not saved.") {
    return { label: status, variant: "destructive" };
  }

  return { label: status, variant: "outline" };
}

export function StudyNavbar(props: StudyNavbarProps) {
  const { workspace, status, online, conflict, analyzing } = props;
  const steps = workspace?.roadmap.definition.steps ?? [];
  const step = workspace ? steps[workspace.currentStep] : undefined;
  const state = saveState(props);
  const saveBlocked = conflict || !online;

  const actions = workspace && (
    <>
      <Badge
        size="sm"
        variant={state.variant}
        className="max-md:hidden"
        title={status}
      >
        {state.label}
      </Badge>

      <Tooltip content="Download draft" side="bottom" className="max-sm:hidden">
        <TooltipTrigger
          variant="ghost"
          size="sm"
          iconOnly
          aria-label="Download draft"
          onClick={props.onDownload}
        >
          <DownloadIcon />
        </TooltipTrigger>
      </Tooltip>

      <Button
        size="sm"
        variant="outline"
        disabled={saveBlocked}
        onClick={props.onSave}
      >
        Save
      </Button>
      <Button
        size="sm"
        disabled={saveBlocked || analyzing}
        onClick={props.onAnalyze}
      >
        <SparklesIcon />
        {analyzing ? "Analyzing…" : "Analyze"}
      </Button>
    </>
  );

  return (
    <Navbar actions={actions}>
      {workspace && (
        <nav
          aria-label="Breadcrumb"
          className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground max-sm:hidden"
        >
          <ChevronRightIcon className="size-4 shrink-0" />
          <span className="truncate">{workspace.roadmap.definition.title}</span>
          {step && (
            <>
              <ChevronRightIcon className="size-4 shrink-0" />
              <span className="truncate font-medium text-foreground">
                {step.title}
              </span>
            </>
          )}
        </nav>
      )}

      <p role="status" className="sr-only">
        {online
          ? status
          : "Offline. Your draft stays in this tab; reconnect to save."}
      </p>
    </Navbar>
  );
}
