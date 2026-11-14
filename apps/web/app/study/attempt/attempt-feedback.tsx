"use client";

import { WorkspaceCommandsProvider } from "../workspace/workspace-commands-context";
import { Section } from "./feedback-section";
import {
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion/accordion";
import { Badge } from "@/components/ui/badge/badge";
import type { Challenge } from "@/lib/roadmap";
import { askAboutCriterion } from "../analysis/analysis-state";
import type { Finding } from "../study-types";
import type { AttemptResult } from "../study-api";
import { summaryDisagrees } from "./attempt-feedback-state";
import { nextAction } from "./attempt-status";
import {
  AskButton,
  type AskSeymour,
  type OpenLocation,
} from "./feedback-actions";
import { FindingList } from "./finding-list";
import { HintLadder } from "./hint-ladder";
import { SyntaxDiagnostics } from "./syntax-diagnostics";

/**
 * The official result of one attempt: next action, unmet criteria, findings by severity,
 * hints and Seymour's commentary, which never overrides the verdict.
 */
export function AttemptFeedback({
  result,
  challenge,
  finalStep,
  attemptId,
  onOpenLocation,
  onAskSeymour,
}: {
  result: AttemptResult;
  challenge: Challenge;
  finalStep: boolean;
  attemptId?: string;
  onOpenLocation?: OpenLocation;
  onAskSeymour?: AskSeymour;
}) {
  const descriptions = new Map(
    challenge.criteria.map((criterion) => [
      criterion.id,
      criterion.description,
    ]),
  );
  const evaluation = result.evaluation;
  const unmet = evaluation?.criteria.filter((item) => item.status !== "met");
  const met = evaluation?.criteria.filter((item) => item.status === "met");
  const findings: Finding[] = evaluation?.findings ?? [];

  return (
    <WorkspaceCommandsProvider
      value={{ onOpenLocation, onAskSeymour }}
    >
      <div className="space-y-4">
        <p>
          <strong>Next:</strong> {nextAction(result, finalStep)}
        </p>

        {result.syntax && result.status === "syntax_error" && (
          <SyntaxDiagnostics
            syntax={result.syntax}
          />
        )}

        {unmet && unmet.length > 0 && (
          <Section title="Not met yet">
            <ul className="space-y-3">
              {unmet.map((criterion) => {
                const description =
                  descriptions.get(criterion.id) ?? "This criterion";

                return (
                  <li key={criterion.id} className="space-y-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <Badge size="sm" variant="warning">
                        Not met
                      </Badge>
                      <span>{description}</span>
                      <AskButton
                        prompt={askAboutCriterion(description)}
                        label={`Ask Seymour about: ${description}`}
                      />
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {criterion.feedback}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Section>
        )}

        {met && met.length > 0 && (
          <AccordionItem className="border-b-0">
            <AccordionTrigger size="sm" className="py-1 font-semibold">
              Met ({met.length} of {evaluation!.criteria.length})
            </AccordionTrigger>
            <ul className="mt-2 space-y-2">
              {met.map((criterion) => (
                <li key={criterion.id} className="space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <Badge size="sm" variant="success">
                      Met
                    </Badge>
                    {descriptions.get(criterion.id) ?? "This criterion"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {criterion.feedback}
                  </p>
                </li>
              ))}
            </ul>
          </AccordionItem>
        )}

        {findings.length > 0 && (
          <Section title="Findings">
            <FindingList
              findings={findings}
              />
          </Section>
        )}

        {evaluation && result.status !== "approved" && (
          <HintLadder hints={evaluation.hints} attemptId={attemptId} />
        )}

        {evaluation && (
          <aside
            aria-label="Seymour's comments"
            className="space-y-1 rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground"
          >
            <p className="text-xs font-semibold tracking-wide uppercase">
              Seymour&apos;s comments
            </p>
            <p>{evaluation.summary}</p>

            {summaryDisagrees(result, evaluation.summary) && (
              <p className="text-xs">
                Papert&apos;s verdict above is the official result for this
                attempt.
              </p>
            )}
          </aside>
        )}

        {evaluation && (
          <p className="text-xs text-muted-foreground">
            This is a static review of your code, not proof that the program runs
            correctly.
          </p>
        )}
      </div>
    </WorkspaceCommandsProvider>
  );
}
