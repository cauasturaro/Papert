"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert/alert";
import { Badge } from "@/components/ui/badge/badge";
import { SyntaxDiagnostics } from "../attempt-feedback";
import type { useAnalysis } from "./use-analysis";

type AnalysisPanelProps = {
  analysis: ReturnType<typeof useAnalysis>;
};

export function AnalysisPanel({ analysis }: AnalysisPanelProps) {
  const { execution, syntax, message, running } = analysis;
  const idle = !execution && !syntax && !message;

  return (
    <section
      aria-label="Analysis"
      className="flex h-full min-h-0 flex-col bg-card"
    >
      <header className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Analysis
        </h2>
        {execution && (
          <Badge size="sm" variant={running ? "default" : "secondary"}>
            {execution.status}
          </Badge>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3 text-sm">
        {idle && (
          <p className="text-muted-foreground">
            Papert first checks syntax for TypeScript, JavaScript, Python, YAML,
            Dockerfile, SQL (PostgreSQL) and JSON files. Syntax errors are shown
            without calling Seymour and use no tokens. Valid code is then
            reviewed by Seymour against the step criteria; Papert decides
            approval.
          </p>
        )}

        <p role="status">{message}</p>

        {syntax && (
          <Alert variant="destructive" size="sm" role="alert">
            <AlertTitle>
              Fix these syntax errors before Seymour analyzes your code:
            </AlertTitle>
            <AlertDescription className="text-foreground">
              <SyntaxDiagnostics syntax={syntax} />
            </AlertDescription>
          </Alert>
        )}

        {execution && (
          <div className="space-y-2">
            <p role="status" className="sr-only">
              Analysis: {execution.status}
            </p>
            <p className="whitespace-pre-wrap" aria-live="polite">
              {execution.text}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
