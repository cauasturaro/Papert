"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppNav } from "@/components/app/app-nav";
import { Navbar } from "@/components/app/navbar";
import { buttonVariants } from "@/components/ui/button/button";
import { ErrorPanel } from "@/components/ui/error-panel/error-panel";
import { errorKind, toLearnerMessage } from "@/lib/api/learner-error";
import { signInHref } from "@/lib/auth/session-signal";
import { readWorkspace } from "../study-api";
import { studyKeys } from "../study-keys";
import { StudyWorkspace } from "../workspace/study-workspace";
import { WorkspaceSkeleton } from "../workspace/study-skeletons";
import { useViewportLock } from "../workspace/use-viewport-lock";

function homeLink(label: string, primary = false) {
  return (
    <Link
      href="/study"
      className={buttonVariants({
        size: "sm",
        variant: primary ? "default" : "outline",
      })}
    >
      {label}
    </Link>
  );
}

function WorkspaceProblem({
  error,
  workspaceId,
  onRetry,
}: {
  error: unknown;
  workspaceId: string;
  onRetry: () => void;
}) {
  const kind = errorKind(error);
  let panel = (
    <ErrorPanel
      layout="page"
      headingLevel="h1"
      title="Your study space could not load"
      message={toLearnerMessage(error)}
      onRetry={onRetry}
      actions={homeLink("Back to study home")}
    />
  );

  // Unknown, malformed and other people's workspaces all read as "not found".
  if (kind === "not_found" || kind === "forbidden" || kind === "validation") {
    panel = (
      <ErrorPanel
        layout="page"
        headingLevel="h1"
        title="Study space not found"
        message="This study space does not exist or belongs to another account. Start or resume a roadmap from your study home."
        actions={homeLink("Go to study home", true)}
      />
    );
  }

  if (kind === "session_expired") {
    const href = signInHref(`/study/${encodeURIComponent(workspaceId)}`);

    panel = (
      <ErrorPanel
        layout="page"
        headingLevel="h1"
        title="Sign in to open your study space"
        message="Your session ended or you are not signed in. Any changes you made on this device are kept and come back after you sign in."
        actions={
          <Link href={href} className={buttonVariants({ size: "sm" })}>
            Sign in
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar>
        <AppNav />
      </Navbar>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 overflow-auto"
      >
        {panel}
      </main>
    </div>
  );
}

export function WorkspaceRoute() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const params = useSearchParams();

  useViewportLock();

  // Starting a roadmap seeds this entry, so the IDE opens without a second request.
  const query = useQuery({
    queryKey: studyKeys.workspace(workspaceId),
    queryFn: () => readWorkspace(workspaceId),
    refetchOnWindowFocus: false,
  });

  if (query.data) {
    return (
      <div className="flex h-dvh flex-col overflow-hidden">
        {/* The session reads the first loaded version; later changes come from saves. */}
        <StudyWorkspace
          key={query.data.id}
          workspace={query.data}
          initialFile={params.get("file")}
          initialStepId={params.get("step")}
        />
      </div>
    );
  }

  if (query.error) {
    return (
      <WorkspaceProblem
        error={query.error}
        workspaceId={workspaceId}
        onRetry={() => void query.refetch()}
      />
    );
  }

  return <WorkspaceSkeleton />;
}
