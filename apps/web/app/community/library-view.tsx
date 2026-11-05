"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { buttonVariants } from "@/components/ui/button/button";
import { Card } from "@/components/ui/card/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { BookmarkIcon } from "@/components/icons";
import { listLibrary } from "./community-api";
import { LIBRARY_KEY } from "./community-keys";
import { LoadErrorAlert } from "@/components/app/load-error-alert";
import { RoadmapCard } from "./roadmap-card";
import { useCommunityActions } from "./use-community-actions";

/** Saved community roadmaps: references to the originals, most recent first. */
export function LibraryView() {
  const actions = useCommunityActions();

  const library = useQuery({
    queryKey: LIBRARY_KEY,
    queryFn: listLibrary,
    retry: false,
  });

  return (
    <>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Your library</h1>
        <p className="text-sm text-muted-foreground">
          Roadmaps you saved from the community. Saving keeps a link to the
          original; it never copies it.
        </p>
      </div>

      {library.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading your library…
        </p>
      )}

      {library.error && (
        <LoadErrorAlert
          error={library.error}
          title="Your library could not load"
          onRetry={() => void library.refetch()}
        />
      )}

      {actions.error && (
        <p role="alert" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}

      {library.data && library.data.length === 0 && (
        <Card>
          <EmptyState size="lg">
            <EmptyStateIcon>
              <BookmarkIcon />
            </EmptyStateIcon>
            <EmptyStateTitle>Nothing saved yet</EmptyStateTitle>
            <EmptyStateDescription>
              Save community roadmaps to find them here.
            </EmptyStateDescription>
            <EmptyStateActions>
              <Link href="/community" className={buttonVariants()}>
                Explore community roadmaps
              </Link>
            </EmptyStateActions>
          </EmptyState>
        </Card>
      )}

      {library.data && library.data.length > 0 && (
        <ul
          aria-label="Saved roadmaps"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {library.data.map((card) => (
            <li key={card.id}>
              <RoadmapCard card={card} actions={actions} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
