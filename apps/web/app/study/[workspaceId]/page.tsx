import type { Metadata } from "next";
import { Suspense } from "react";
import { WorkspaceSkeleton } from "../workspace/study-skeletons";
import { WorkspaceRoute } from "./workspace-route";

export const metadata: Metadata = {
  title: "Study",
};

// The workspace is per-user and loaded on the client; the skeleton is the static shell.
export default function StudyWorkspacePage() {
  return (
    <Suspense fallback={<WorkspaceSkeleton />}>
      <WorkspaceRoute />
    </Suspense>
  );
}
