"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button/button";
import { RouteErrorView } from "@/components/ui/error-panel/error-panel";
import {
  downloadDraft,
  readRecovery,
  type Recovery,
} from "./workspace/workspace-recovery";

// The workspace ID from /study/<id>; the creator and draft pages have no device copy.
function workspaceIdFrom(pathname: string) {
  const [, section, id] = pathname.split("/");

  if (section !== "study" || !id || id === "new" || id === "drafts") {
    return null;
  }

  return decodeURIComponent(id);
}

function findRecovery(pathname: string): Recovery | null {
  const workspaceId = workspaceIdFrom(pathname);

  if (!workspaceId) {
    return null;
  }

  try {
    return readRecovery(workspaceId);
  } catch {
    return null;
  }
}

function subscribeToNothing() {
  return () => {};
}

export default function StudyError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const pathname = usePathname();

  // Device storage only exists in the browser; the server render offers no download.
  const hasRecovery = useSyncExternalStore(
    subscribeToNothing,
    () => findRecovery(pathname) !== null,
    () => false,
  );

  function download() {
    const recovery = findRecovery(pathname);

    if (recovery) {
      downloadDraft(recovery);
    }
  }

  const downloadButton = hasRecovery && (
    <Button size="sm" variant="outline" onClick={download}>
      Download my files
    </Button>
  );

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex flex-1 items-center overflow-auto"
    >
      <RouteErrorView
        error={error}
        retry={retry}
        title="Your study space stopped working"
        message={
          hasRecovery
            ? "Something went wrong on our side. Your unsaved changes are kept on this device: try again, or download your files first."
            : "Something went wrong on our side. Try again, or go back to the study home."
        }
        actions={downloadButton}
        homeHref="/study"
        homeLabel="Back to study home"
      />
    </main>
  );
}
