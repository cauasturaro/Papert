"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { SyntaxDiagnostics } from "./attempt-feedback";
import { executionRequest as request } from "./execution-api";
import { isRunning, newerSnapshot } from "./execution-state";
import type { Execution } from "./execution-state";
import type { SyntaxReport } from "./study-api";

type SyntaxRejection = { status: "syntax_error"; syntax: SyntaxReport };

export function AnalysisPanel({
  workspaceId,
  disabled,
  prepare,
  onSettled,
}: {
  workspaceId: string;
  disabled: boolean;
  prepare: () => Promise<number | null>;
  onSettled: () => Promise<void>;
}) {
  const [execution, setExecution] = useState<Execution | null>(null);
  const [syntax, setSyntax] = useState<SyntaxReport | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const settled = useRef(onSettled);

  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    let disposed = false;

    request<Execution[]>(`workspaces/${workspaceId}`)
      .then((jobs) => {
        const latest = jobs.find((job) => job.kind === "analysis");

        if (!disposed && latest && isRunning(latest)) {
          setExecution(latest);
        }
      })
      .catch((error: Error) => {
        if (!disposed) {
          setMessage(error.message);
        }
      });

    return () => {
      disposed = true;
    };
  }, [workspaceId]);

  const executionId = execution?.id;
  const running = isRunning(execution);

  // Core persists every snapshot, so polling recovers progress after reloads.
  useEffect(() => {
    if (!executionId || !running) {
      return;
    }

    let disposed = false;

    const poll = setInterval(async () => {
      try {
        const snapshot = await request<Execution>(executionId);
        if (disposed) {
          return;
        }

        setExecution((current) => newerSnapshot(current, snapshot));

        if (!isRunning(snapshot)) {
          await settled.current();
        }
      } catch (error) {
        if (!disposed) {
          setMessage((error as Error).message);
        }
      }
    }, 1500);

    return () => {
      disposed = true;
      clearInterval(poll);
    };
  }, [executionId, running]);

  async function analyze() {
    setBusy(true);
    setMessage("");
    setSyntax(null);

    try {
      const revision = await prepare();
      if (revision === null) {
        setMessage("Save your changes before analyzing.");
        return;
      }

      const created = await request<Execution | SyntaxRejection>(
        `workspaces/${workspaceId}`,
        { requestKey: crypto.randomUUID(), kind: "analysis", revision },
      );

      if (created.status === "syntax_error") {
        setSyntax((created as SyntaxRejection).syntax);
        setExecution(null);
        await onSettled();
        return;
      }

      setExecution(created as Execution);
      await onSettled();
    } catch (error) {
      setMessage((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="space-y-3 rounded-xl border border-current/15 p-4"
      aria-label="Analysis"
    >
      <h2 className="text-xl font-semibold">Analyze your attempt</h2>
      <p className="text-sm">
        Papert first checks syntax for TypeScript, JavaScript, Python, YAML,
        Dockerfile, SQL (PostgreSQL) and JSON files. Syntax errors are shown
        without calling Seymour and use no tokens. Valid code is then reviewed
        by Seymour against the step criteria; Papert decides approval.
      </p>

      <Button
        type="button"
        disabled={disabled || busy || running}
        onClick={() => void analyze()}
      >
        {running ? "Analysis running…" : "Save and analyze"}
      </Button>

      <p role="status">{message}</p>

      {syntax && (
        <div role="alert" className="space-y-2">
          <p className="font-semibold">
            Fix these syntax errors before Seymour analyzes your code:
          </p>
          <SyntaxDiagnostics syntax={syntax} />
        </div>
      )}

      {execution && (
        <div className="space-y-2">
          <p role="status">Analysis: {execution.status}</p>
          <p className="whitespace-pre-wrap text-sm" aria-live="polite">
            {execution.text}
          </p>
        </div>
      )}
    </section>
  );
}
