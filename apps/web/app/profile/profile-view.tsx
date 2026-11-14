"use client";

import { LoadErrorAlert } from "@/components/app/load-error-alert";
import { CardSkeleton } from "@/components/ui/card/card-skeleton";
import { AchievementList } from "./achievement-list";
import { RoadmapProgressList } from "./roadmap-progress-list";
import { StreakCard } from "./streak-card";
import { useEngagement } from "./use-engagement";
import { useTimeZoneDetection } from "./use-time-zone-detection";

export function ProfileView() {
  const {
    engagement,
    error,
    savingTimeZone,
    chooseTimeZone,
    reportDetectedTimeZone,
  } = useEngagement();
  const view = engagement.data;

  useTimeZoneDetection(view, reportDetectedTimeZone);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Your progress</h1>
        <p className="text-sm text-muted-foreground">
          Streaks, achievements and step progress come from the analyses Papert
          recorded. Seymour cannot grant them.
        </p>
      </div>

      {engagement.isPending && (
        <div
          aria-busy="true"
          aria-label="Loading your progress"
          className="space-y-4"
        >
          <CardSkeleton />
          <CardSkeleton />
        </div>
      )}

      {engagement.error && (
        <LoadErrorAlert
          error={engagement.error}
          title="Your progress could not be loaded"
          signedOutTitle="Sign in to see your progress"
          onRetry={() => void engagement.refetch()}
        />
      )}

      {view && (
        <>
          <StreakCard
            engagement={view}
            saving={savingTimeZone}
            error={error}
            onChooseTimeZone={chooseTimeZone}
          />

          <AchievementList achievements={view.achievements} />

          <RoadmapProgressList roadmaps={view.roadmaps} />
        </>
      )}
    </div>
  );
}
