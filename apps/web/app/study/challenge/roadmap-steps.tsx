import { Badge, type BadgeProps } from "@/components/ui/badge/badge";
import {
  Timeline,
  TimelineItem,
  TimelineTitle,
} from "@/components/ui/timeline/timeline";
import type { Roadmap } from "../study-api";

type StepState = "completed" | "current" | "locked";

const badges: Record<
  StepState,
  { label: string; variant: BadgeProps["variant"] }
> = {
  completed: { label: "Completed", variant: "success" },
  current: { label: "Current step", variant: "default" },
  locked: { label: "Locked", variant: "secondary" },
};

function stepState(index: number, currentStep: number): StepState {
  if (index < currentStep) {
    return "completed";
  }

  return index === currentStep ? "current" : "locked";
}

/** The roadmap's steps; completed steps reopen read-only when `onSelectStep` is given. */
export function RoadmapSteps({
  roadmap,
  currentStep,
  viewedStepId,
  onSelectStep,
}: {
  roadmap: Roadmap;
  currentStep: number;
  viewedStepId?: string | null;
  onSelectStep?: (stepId: string | null) => void;
}) {
  return (
    <Timeline size="sm" aria-label="Roadmap steps">
      {roadmap.definition.steps.map((item, index) => {
        const state = stepState(index, currentStep);
        const badge = badges[state];
        const viewed =
          viewedStepId === item.id || (!viewedStepId && state === "current");
        const selectable = !!onSelectStep && state !== "locked" && !viewed;
        const title = `${index + 1}. ${item.title}`;

        return (
          <TimelineItem
            key={item.id}
            aria-current={viewed ? "step" : undefined}
          >
            <TimelineTitle
              as="h4"
              className="flex flex-wrap items-center gap-2"
            >
              {selectable ? (
                <button
                  type="button"
                  className="rounded-sm text-left underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => {
                    onSelectStep(state === "current" ? null : item.id);
                  }}
                >
                  {title}
                </button>
              ) : (
                <span className={viewed ? "font-semibold" : undefined}>
                  {title}
                </span>
              )}

              <Badge size="sm" variant={badge.variant}>
                {badge.label}
              </Badge>
            </TimelineTitle>

            {state === "locked" && (
              <p className="text-xs text-muted-foreground">
                Unlocks after Step {index}
              </p>
            )}
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
