import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion/accordion";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { AttemptFeedback, AttemptStatusBadge } from "../attempt-feedback";
import type { Workspace } from "../study-api";

export function AttemptHistory({ workspace }: { workspace: Workspace }) {
  const steps = workspace.roadmap.definition.steps;
  const finalStepId = steps[steps.length - 1]?.id;

  if (workspace.attempts.length === 0) {
    return (
      <EmptyState size="sm" className="py-10">
        <EmptyStateTitle as="h2">No attempts recorded yet.</EmptyStateTitle>
        <EmptyStateDescription>
          Save your notes and record an attempt, or analyze your code.
        </EmptyStateDescription>
      </EmptyState>
    );
  }

  return (
    <section aria-label="Attempt history">
      <h2 className="sr-only">Attempt history</h2>

      <Accordion>
        {workspace.attempts.map((attempt, index) => (
          <AccordionItem
            key={attempt.id}
            defaultOpen={index === 0}
            className="last:border-b-0"
          >
            <AccordionTrigger size="sm">
              <span className="flex flex-wrap items-center gap-2">
                {attempt.stepId} · revision {attempt.revision}
                <AttemptStatusBadge result={attempt.result} />
              </span>
            </AccordionTrigger>

            <AccordionContent className="text-foreground">
              <AttemptFeedback
                result={attempt.result}
                challenge={attempt.challenge}
                finalStep={attempt.stepId === finalStepId}
              />

              <p>{attempt.challenge.instructions}</p>

              <ul className="list-inside list-disc">
                {attempt.challenge.criteria.map((criterion) => (
                  <li key={criterion.id}>{criterion.description}</li>
                ))}
              </ul>

              {Object.entries(attempt.files).map(([path, content]) => (
                <div key={path}>
                  <p className="font-mono text-xs">{path}</p>
                  <pre className="overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                    <code>{content}</code>
                  </pre>
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
