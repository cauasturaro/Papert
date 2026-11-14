"use client";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert/alert";
import { Button } from "@/components/ui/button/button";
import { formatRelativeTime } from "@/lib/format/time";
import type { WorkspaceSession } from "./use-workspace-session";

const bannerClasses = "rounded-none border-x-0 border-t-0";
const rowClasses = "flex flex-wrap items-center gap-3 space-y-0";

/**
 * Notices under the navbar, one per situation, most urgent first. The global "session
 * ended" banner lives in the app shell; the save indicator covers routine states.
 */
export function WorkspaceBanners({
  session,
  onResolveConflict,
}: {
  session: WorkspaceSession;
  onResolveConflict: () => void;
}) {
  const { failure, saveState } = session;

  if (session.conflict) {
    return (
      <Alert
        variant="destructive"
        size="sm"
        role="alert"
        className={bannerClasses}
      >
        <AlertTitle>Your files changed somewhere else</AlertTitle>

        <AlertDescription className={rowClasses}>
          <p className="flex-1">
            Saving is paused. Your changes here are kept on this device until
            you choose which version to keep.
          </p>

          <Button size="sm" variant="outline" onClick={session.download}>
            Download mine
          </Button>

          <Button size="sm" onClick={onResolveConflict}>
            Choose a version
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (session.recoveredAt !== null) {
    return (
      <Alert variant="info" size="sm" role="status" className={bannerClasses}>
        <AlertDescription className={rowClasses}>
          <p className="flex-1">
            Recovered unsaved changes from{" "}
            {formatRelativeTime(session.recoveredAt)}.
          </p>

          <Button
            size="sm"
            variant="outline"
            onClick={session.discardRecovered}
          >
            Discard
          </Button>

          <Button size="sm" onClick={session.keepRecovered}>
            Keep
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (saveState === "invalid" && failure) {
    return (
      <Alert variant="warning" size="sm" role="alert" className={bannerClasses}>
        <AlertTitle>Your changes could not be saved</AlertTitle>
        <AlertDescription>
          {failure.message} Your changes are kept on this device.
        </AlertDescription>
      </Alert>
    );
  }

  if (saveState === "failed" && failure) {
    return (
      <Alert
        variant="destructive"
        size="sm"
        role="alert"
        className={bannerClasses}
      >
        <AlertDescription className={rowClasses}>
          <p className="flex-1">
            {failure.message} Your changes are kept on this device.
          </p>

          <Button
            size="sm"
            variant="outline"
            onClick={() => void session.save()}
          >
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <>
      {saveState === "offline" && (
        // Wide screens show this in the save indicator.
        <p className="shrink-0 border-b border-border bg-muted px-4 py-1.5 text-sm md:hidden">
          Offline. Your changes are kept on this device and saved when you
          reconnect.
        </p>
      )}

      {session.openElsewhere && (
        <p className="shrink-0 border-b border-border bg-muted px-4 py-1.5 text-sm">
          This workspace is also open in another tab. Edit it in one tab at a
          time to avoid conflicting changes.
        </p>
      )}

      {session.message && (
        <p
          role="status"
          className="shrink-0 border-b border-border bg-muted px-4 py-1.5 text-sm"
        >
          {session.message}
        </p>
      )}
    </>
  );
}
