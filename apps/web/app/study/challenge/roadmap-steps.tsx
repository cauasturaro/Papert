import { Badge, type BadgeProps } from "@/components/ui/badge/badge";
import {
  Timeline,
  TimelineItem,
  TimelineTitle,
} from "@/components/ui/timeline/timeline";
import type { Roadmap } from "../study-api";

function stepStatus(
  index: number,
  currentStep: number,
): { label: string; variant: BadgeProps["variant"] } {
  if (index > currentStep) {
    return { label: "Locked", variant: "secondary" };
  }

  if (index < currentStep) {
    return { label: "Completed", variant: "success" };
  }

  return { label: "Current step", variant: "default" };
}

export function RoadmapSteps({
  roadmap,
  currentStep,
}: {
  roadmap: Roadmap;
  currentStep: number;
}) {
  return (
    <Timeline size="sm" aria-label="Roadmap steps">
      {roadmap.definition.steps.map((item, index) => {
        const status = stepStatus(index, currentStep);

        return (
          <TimelineItem key={item.id}>
            <TimelineTitle
              as="h4"
              className="flex flex-wrap items-center gap-2"
            >
              {item.title}
              <Badge size="sm" variant={status.variant}>
                {status.label}
              </Badge>
            </TimelineTitle>
          </TimelineItem>
        );
      })}
    </Timeline>
  );
}
