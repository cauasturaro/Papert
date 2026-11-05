"use client";

import { useState } from "react";
import { Badge, type BadgeProps } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import type { Challenge } from "@/lib/roadmap";
import type { AttemptResult, SyntaxReport } from "./study-api";

const statusLabels: Record<AttemptResult["status"], string> = {
  not_evaluated: "Not evaluated",
  syntax_error: "Syntax errors",
  evaluating: "Analysis running",
  needs_work: "Needs work",
  approved: "Approved",
  analysis_failed: "Analysis did not complete",
};

const statusVariants: Record<AttemptResult["status"], BadgeProps["variant"]> = {
  not_evaluated: "outline",
  syntax_error: "destructive",
  evaluating: "secondary",
  needs_work: "destructive",
  approved: "success",
  analysis_failed: "destructive",
};

export function statusLabel(result: AttemptResult) {
  return statusLabels[result.status] ?? result.status;
}

export function AttemptStatusBadge({ result }: { result: AttemptResult }) {
  return (
    <Badge size="sm" variant={statusVariants[result.status] ?? "outline"}>
      {statusLabel(result)}
    </Badge>
  );
}

export function nextAction(result: AttemptResult, finalStep: boolean) {
  if (result.status === "syntax_error") {
    return "Fix the syntax errors below, save, and analyze again.";
  }

  if (result.status === "needs_work") {
    return "Address the unmet criteria, save a new revision and analyze it. Seymour's Review mode can guide you.";
  }

  if (result.status === "approved") {
    return finalStep
      ? "You completed this roadmap."
      : "The next step is unlocked. Continue with it.";
  }

  if (result.status === "analysis_failed") {
    return "Your progress did not change. Analyze this revision again.";
  }

  if (result.status === "evaluating") {
    return "Wait for Seymour to finish the analysis.";
  }

  return "Save your work and analyze it.";
}

export function SyntaxDiagnostics({ syntax }: { syntax: SyntaxReport }) {
  return (
    <div className="space-y-2">
      {syntax.diagnostics.length > 0 && (
        <ul className="list-inside list-disc" aria-label="Syntax errors">
          {syntax.diagnostics.map((item, index) => (
            <li key={`${item.path}-${index}`} className="text-sm">
              <span className="font-mono">
                {item.path}:{item.line}:{item.column}
              </span>{" "}
              ({item.language}) {item.message}
            </li>
          ))}
        </ul>
      )}

      {syntax.unchecked.length > 0 && (
        <p className="text-sm">
          Not syntax-checked (no checker for this file type):{" "}
          <span className="font-mono">{syntax.unchecked.join(", ")}</span>
        </p>
      )}
    </div>
  );
}

function GradualHints({ hints }: { hints: string[] }) {
  const [shown, setShown] = useState(0);

  return (
    <div className="space-y-2">
      <h4 className="font-semibold">Hints</h4>

      {shown > 0 && (
        <ol className="list-inside list-decimal">
          {hints.slice(0, shown).map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ol>
      )}

      {shown < hints.length && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShown((value) => value + 1)}
        >
          {shown === 0 ? "Show a hint" : "Show a more specific hint"}
        </Button>
      )}
    </div>
  );
}

export function AttemptFeedback({
  result,
  challenge,
  finalStep,
}: {
  result: AttemptResult;
  challenge: Challenge;
  finalStep: boolean;
}) {
  const descriptions = new Map(
    challenge.criteria.map((criterion) => [
      criterion.id,
      criterion.description,
    ]),
  );
  const evaluation = result.evaluation;

  return (
    <div className="space-y-3">
      <p>
        <strong>Next action:</strong> {nextAction(result, finalStep)}
      </p>

      {result.syntax && <SyntaxDiagnostics syntax={result.syntax} />}

      {evaluation && (
        <>
          <p>{evaluation.summary}</p>

          <h4 className="font-semibold">Criteria</h4>
          <ul className="space-y-2">
            {evaluation.criteria.map((criterion) => (
              <li key={criterion.id} className="space-y-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge
                    size="sm"
                    variant={
                      criterion.status === "met" ? "success" : "destructive"
                    }
                  >
                    {criterion.status === "met" ? "✓ Met" : "✗ Not met"}
                  </Badge>
                  {descriptions.get(criterion.id) ?? criterion.id}
                </p>
                <p className="text-sm text-muted-foreground">
                  {criterion.feedback}
                </p>
              </li>
            ))}
          </ul>

          {evaluation.findings.length > 0 && (
            <>
              <h4 className="font-semibold">Findings</h4>
              <ul className="list-inside list-disc">
                {evaluation.findings.map((finding, index) => (
                  <li key={index} className="text-sm">
                    {finding.severity} · {finding.category}
                    {finding.path && (
                      <span className="font-mono"> · {finding.path}</span>
                    )}
                    : {finding.message}
                  </li>
                ))}
              </ul>
            </>
          )}

          {result.status !== "approved" && (
            <GradualHints hints={evaluation.hints} />
          )}

          <p className="text-xs text-muted-foreground">
            This is a static review of your code, not proof that the program
            runs correctly.
          </p>
        </>
      )}
    </div>
  );
}
