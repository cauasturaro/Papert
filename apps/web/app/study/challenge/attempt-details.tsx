"use client";

import { useState } from "react";
import {
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion/accordion";
import { Button } from "@/components/ui/button/button";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { AttemptFeedback } from "../attempt/attempt-feedback";
import { useWorkspaceCommands } from "../workspace/workspace-commands-context";
import type { Workspace } from "../study-api";
import type { AttemptSummary } from "./attempts-api";
import { DiffView } from "./attempt-diff";
import { useAttemptFiles } from "./use-attempt-files";

export function AttemptDetails({
  workspace,
  attempt,
  previous,
  finalStep,
}: {
  workspace: Workspace;
  attempt: AttemptSummary;
  previous: AttemptSummary | undefined;
  finalStep: boolean;
}) {
  const { onRestoreFiles } = useWorkspaceCommands();
  const own = useAttemptFiles(workspace, attempt.id);
  const prior = useAttemptFiles(workspace, previous?.id);
  const [view, setView] = useState<"none" | "files" | "diff">("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function show(next: "files" | "diff") {
    if (view === next) {
      setView("none");
      return;
    }

    setLoading(true);
    setError("");

    try {
      await own.load();

      if (next === "diff" && previous) {
        await prior.load();
      }

      setView(next);
    } catch (failure) {
      setError(toLearnerMessage(failure));
    } finally {
      setLoading(false);
    }
  }

  async function restore() {
    if (!onRestoreFiles) {
      return;
    }

    try {
      const restored = await own.load();

      onRestoreFiles(restored);
    } catch (failure) {
      setError(toLearnerMessage(failure));
    }
  }

  const ownFiles = own.files;
  const previousFiles = prior.files;

  return (
    <div className="space-y-3">
      <AttemptFeedback
        result={attempt.result}
        challenge={attempt.challenge}
        finalStep={finalStep}
        attemptId={attempt.id}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-expanded={view === "files"}
          disabled={loading}
          onClick={() => void show("files")}
        >
          {view === "files" ? "Hide files" : "Show files"}
        </Button>

        {previous && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-expanded={view === "diff"}
            disabled={loading}
            onClick={() => void show("diff")}
          >
            {view === "diff" ? "Hide comparison" : "Compare with previous"}
          </Button>
        )}

        {onRestoreFiles && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => void restore()}
          >
            Restore these files
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}

      {view === "files" && ownFiles && (
        <div className="space-y-2">
          {Object.entries(ownFiles).map(([path, content]) => (
            <AccordionItem key={path} className="border-b-0">
              <AccordionTrigger
                size="sm"
                className="py-1 font-mono text-xs font-normal"
              >
                {path}
              </AccordionTrigger>
              <pre className="mt-1 max-h-80 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                <code>{content}</code>
              </pre>
            </AccordionItem>
          ))}
        </div>
      )}

      {view === "diff" && ownFiles && previousFiles && (
        <DiffView before={previousFiles} after={ownFiles} />
      )}
    </div>
  );
}
