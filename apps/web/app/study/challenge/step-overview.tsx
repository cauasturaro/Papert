import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert/alert";
import { Badge } from "@/components/ui/badge/badge";
import { CompletionAchievement } from "../../profile/completion-achievement";
import type { Workspace } from "../study-api";
import { RoadmapSteps } from "./roadmap-steps";

export function StepOverview({ workspace }: { workspace: Workspace }) {
  const steps = workspace.roadmap.definition.steps;
  const step = steps[workspace.currentStep];
  const completed = workspace.currentStep >= steps.length;

  return (
    <div className="space-y-6 text-sm leading-relaxed">
      {completed && (
        <Alert variant="success" aria-label="Roadmap completed" role="region">
          <AlertTitle>Roadmap completed</AlertTitle>
          <AlertDescription>
            <p>
              Every step of this roadmap was approved. Your workspace and
              attempt history remain available.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {completed && <CompletionAchievement roadmapId={workspace.roadmap.id} />}

      {step && (
        <section aria-label="Current challenge" className="space-y-4">
          <div className="space-y-2">
            <Badge size="sm" variant="secondary">
              Step {workspace.currentStep + 1} of {steps.length}
            </Badge>
            <h2 className="text-xl font-semibold tracking-tight">
              {step.title}
            </h2>
          </div>

          <p className="text-muted-foreground">{step.content}</p>

          <div className="space-y-2 rounded-lg border border-border bg-muted/60 p-3">
            <h3 className="font-semibold">Challenge</h3>
            <p>{step.challenge.instructions}</p>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Acceptance criteria</h3>
            <ul className="space-y-2">
              {step.challenge.criteria.map((criterion) => (
                <li key={criterion.id} className="flex gap-2">
                  <span
                    aria-hidden="true"
                    className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ring"
                  />
                  {criterion.description}
                </li>
              ))}
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
            Created by {workspace.roadmap.authorName}
          </p>
        </div>
        <RoadmapSteps
          roadmap={workspace.roadmap}
          currentStep={workspace.currentStep}
        />
      </section>
    </div>
  );
}
