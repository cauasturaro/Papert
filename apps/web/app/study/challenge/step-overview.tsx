"use client";

import Link from "next/link";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge/badge";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { Markdown } from "@/components/ui/markdown/markdown";
import { CompletionAchievement } from "../../profile/completion-achievement";
import {
  askAboutCriterion,
  criteriaStates,
  mentionedFiles,
  type CriterionState,
} from "../analysis/analysis-state";
import type { AskSeymour, OpenLocation } from "../attempt/feedback-actions";
import type { Workspace } from "../study-api";
import { RoadmapSteps } from "./roadmap-steps";

type StepOverviewProps = {
  workspace: Workspace;
  // A completed step to show read-only; null or absent shows the current step.
  viewedStepId?: string | null;
  onSelectStep?: (stepId: string | null) => void;
  onOpenLocation?: OpenLocation;
  onAskSeymour?: AskSeymour;
};

const criterionBadges: Record<
  CriterionState,
  { label: string; variant: BadgeProps["variant"] }
> = {
  met: { label: "Met", variant: "success" },
  not_met: { label: "Not met", variant: "warning" },
  unchecked: { label: "Not checked yet", variant: "outline" },
};

function RoadmapCompleted({ workspace }: { workspace: Workspace }) {
  const linkClass = buttonVariants({ size: "sm", variant: "outline" });

  return (
    <section aria-label="Roadmap completed" className="space-y-3">
      <Alert variant="success">
        <AlertTitle>Roadmap completed</AlertTitle>
        <AlertDescription>
          <p>
            Every step of this roadmap was approved. Your workspace and attempt
            history stay available, and Seymour can still answer questions and
            teach you about any step.
          </p>
        </AlertDescription>
      </Alert>

      <CompletionAchievement roadmapId={workspace.roadmap.id} />

      <div className="space-y-2">
        <h3 className="font-semibold">What next?</h3>
        <div className="flex flex-wrap gap-2">
          <Link href="/profile" className={linkClass}>
            See your achievements
          </Link>
          <Link href="/community" className={linkClass}>
            Explore community roadmaps
          </Link>
          <Link href="/study/new" className={buttonVariants({ size: "sm" })}>
            Start another roadmap
          </Link>
        </div>
      </div>
    </section>
  );
}

function StepFiles({
  paths,
  files,
  onOpenLocation,
}: {
  paths: string[];
  files: Record<string, string>;
  onOpenLocation?: OpenLocation;
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-semibold">Files for this step</h3>
      <ul className="flex flex-wrap gap-2">
        {paths.map((path) => {
          const exists = Object.hasOwn(files, path);
          const label = exists ? path : `${path} (new)`;

          return (
            <li key={path}>
              {onOpenLocation ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 font-mono text-xs"
                  onClick={() => onOpenLocation(path)}
                >
                  {label}
                </Button>
              ) : (
                <Badge size="sm" variant="outline" className="font-mono">
                  {label}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function StepOverview({
  workspace,
  viewedStepId,
  onSelectStep,
  onOpenLocation,
  onAskSeymour,
}: StepOverviewProps) {
  const steps = workspace.roadmap.definition.steps;
  const completed = workspace.currentStep >= steps.length;
  const viewedIndex = viewedStepId
    ? steps.findIndex((item) => item.id === viewedStepId)
    : -1;
  // Only completed steps reopen; anything else falls back to the current step.
  const readOnly = viewedIndex >= 0 && viewedIndex < workspace.currentStep;
  const index = readOnly ? viewedIndex : workspace.currentStep;
  const step = steps[index];

  const states = step
    ? criteriaStates(step.challenge.criteria, workspace.attempts, step.id)
    : new Map<string, CriterionState>();
  const metCount = [...states.values()].filter(
    (state) => state === "met",
  ).length;
  const stepFiles = step
    ? mentionedFiles(step.challenge.instructions, workspace.files)
    : [];
  const openPath = onOpenLocation
    ? (path: string) => onOpenLocation(path)
    : undefined;

  return (
    <div className="space-y-6 text-sm leading-relaxed">
      {completed && !readOnly && <RoadmapCompleted workspace={workspace} />}

      {readOnly && (
        <Alert variant="info" size="sm">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <span>You completed this step. It is shown read-only.</span>
            {onSelectStep && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onSelectStep(null)}
              >
                {completed
                  ? "Back to the roadmap summary"
                  : "Back to current step"}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {step && (!completed || readOnly) && (
        <section aria-label="Current challenge" className="space-y-4">
          <div className="space-y-2">
            <Badge size="sm" variant="secondary">
              Step {index + 1} of {steps.length}
            </Badge>
            <h2 className="text-xl font-semibold tracking-tight">
              {step.title}
            </h2>
          </div>

          <Markdown
            source={step.content}
            className="text-muted-foreground"
            onPathClick={openPath}
          />

          <div className="space-y-2 rounded-lg border border-border bg-muted/60 p-3">
            <h3 className="font-semibold">Challenge</h3>
            <Markdown
              source={step.challenge.instructions}
              onPathClick={openPath}
            />
          </div>

          {stepFiles.length > 0 && (
            <StepFiles
              paths={stepFiles}
              files={workspace.files}
              onOpenLocation={readOnly ? undefined : onOpenLocation}
            />
          )}

          <div className="space-y-2">
            <h3 className="font-semibold">
              Acceptance criteria{" "}
              <span className="font-normal text-muted-foreground">
                ({metCount} of {step.challenge.criteria.length} met)
              </span>
            </h3>

            <ul className="space-y-2">
              {step.challenge.criteria.map((criterion) => {
                const state = states.get(criterion.id) ?? "unchecked";
                const badge = criterionBadges[state];
                const askable =
                  state === "not_met" && !readOnly && onAskSeymour;

                return (
                  <li
                    key={criterion.id}
                    className="flex flex-wrap items-start gap-2"
                  >
                    <Badge size="sm" variant={badge.variant} className="mt-0.5">
                      {badge.label}
                    </Badge>
                    <span className="min-w-0 flex-1">
                      {criterion.description}
                    </span>

                    {askable && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        aria-label={`Ask Seymour about: ${criterion.description}`}
                        onClick={() => {
                          onAskSeymour(
                            askAboutCriterion(criterion.description),
                          );
                        }}
                      >
                        Ask Seymour
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      <section aria-label="Roadmap" className="space-y-3">
        <div>
          <h3 className="font-semibold">
            {workspace.roadmap.definition.title}
          </h3>
          <p className="text-xs text-muted-foreground">
            Created by {workspace.roadmap.authorName} ·{" "}
            {Math.min(workspace.currentStep, steps.length)} of {steps.length}{" "}
            steps approved
          </p>
        </div>

        <RoadmapSteps
          roadmap={workspace.roadmap}
          currentStep={workspace.currentStep}
          viewedStepId={readOnly ? viewedStepId : null}
          onSelectStep={onSelectStep}
        />
      </section>
    </div>
  );
}
