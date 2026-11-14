"use client";

import { Alert, AlertDescription } from "@/components/ui/alert/alert";

export function GenerateBlockers({
  chosen,
  pending,
  stalled,
}: {
  chosen: boolean;
  pending: number;
  stalled: number;
}) {
  return (
    <>
      {!chosen && (
        <p className="text-sm text-muted-foreground">
          Generating unlocks after the community check, once you choose to
          create your own.
        </p>
      )}

      {pending > 0 && (
        <p className="text-sm text-muted-foreground">
          Wait until every source finishes processing, or remove it, before
          generating.
        </p>
      )}

      {stalled > 0 && (
        <Alert variant="warning" size="sm">
          <AlertDescription>
            {stalled === 1 ? "1 file failed" : `${stalled} files failed`} to
            upload. Retry or remove it in Sources, or generate without it.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
