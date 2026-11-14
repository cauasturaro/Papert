"use client";

import Link from "next/link";
import { OfflineAlert } from "@/components/app/offline-alert";
import { SparklesIcon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { ErrorPanel } from "@/components/ui/error-panel/error-panel";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { signInHref } from "@/lib/auth/session-signal";
import type { useStudy } from "../use-study";
import { HomeSkeleton } from "./home-skeleton";
import { StudyDraftsSection } from "./study-drafts-section";
import { ContinueHero, Discover, NoRoadmaps, Welcome } from "./study-home-sections";
import { StudyRoadmapsSection } from "./study-roadmaps-section";
import { useStudyHome } from "./use-study-home";

/** Study home: where to continue, roadmaps to start, drafts in preparation and creation. */
export function StudyStart({
  study,
  onCreate,
  onOpenDraft,
}: {
  study: ReturnType<typeof useStudy>;
  onCreate: () => void;
  onOpenDraft: (workspaceId: string) => void;
}) {
  const home = useStudyHome(study);
  const {
    roadmaps,
    signedOut,
    recent,
    firstVisit,
    atDraftLimit,
    start,
    startingFor,
    errorFor,
  } = home;

  if (signedOut) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 justify-center overflow-auto bg-muted/40 p-4 sm:p-6"
      >
        <div className="w-full max-w-3xl">
          <ErrorPanel
            layout="page"
            headingLevel="h1"
            title="Sign in to open your study space"
            message="Your roadmaps, drafts and progress are kept with your account."
            actions={
              <Link href={signInHref("/study")} className={buttonVariants()}>
                Go to sign in
              </Link>
            }
          />
        </div>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex flex-1 justify-center overflow-auto bg-muted/40 p-4 sm:p-6"
    >
      <div className="flex w-full max-w-3xl flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">Your study space</h1>

          <Button
            onClick={onCreate}
            disabled={atDraftLimit}
            className={firstVisit ? "hidden" : undefined}
          >
            <SparklesIcon />
            Create a roadmap
          </Button>
        </div>

        <OfflineAlert />

        {roadmaps.isPending && <HomeSkeleton />}

        {roadmaps.error && (
          <ErrorPanel
            className="rounded-lg border border-border bg-card"
            title="Your roadmaps could not load"
            message={toLearnerMessage(roadmaps.error)}
            onRetry={() => void roadmaps.refetch()}
          />
        )}

        {recent && recent.workspace && (
          <ContinueHero
            title={recent.roadmap.definition.title}
            stepTitle={
              recent.roadmap.definition.steps[recent.workspace.currentStep]
                ?.title ?? null
            }
            stepNumber={recent.workspace.currentStep + 1}
            stepCount={recent.roadmap.definition.steps.length}
            lastActivityAt={recent.workspace.lastActivityAt ?? null}
            starting={startingFor(recent.roadmap.id)}
            error={errorFor(recent.roadmap.id)}
            onContinue={() => start(recent.roadmap.id)}
          />
        )}

        {firstVisit && <Welcome onCreate={onCreate} />}

        <StudyDraftsSection home={home} onOpenDraft={onOpenDraft} />

        {!firstVisit && <Discover />}

        {!firstVisit && roadmaps.data && roadmaps.data.length === 0 && (
          <NoRoadmaps onCreate={onCreate} />
        )}

        <StudyRoadmapsSection home={home} />
      </div>
    </main>
  );
}
