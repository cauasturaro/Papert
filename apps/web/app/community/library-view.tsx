"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { announce } from "@/lib/a11y/announcer";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { Card } from "@/components/ui/card/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { BookmarkIcon } from "@/components/icons";
import { listLibraryPage } from "./community-api";
import { LIBRARY_KEY } from "./community-keys";
import { LoadErrorAlert } from "@/components/app/load-error-alert";
import { RoadmapCard } from "./roadmap-card";
import { ActionError } from "./action-error";
import { useCommunityActions } from "./use-community-actions";

const CARD_FOCUS_TARGET = "a[href], button:not(:disabled)";

function focusCardAt(list: HTMLUListElement | null, index: number) {
  const cards = list?.querySelectorAll<HTMLElement>("li[data-roadmap-id]");
  const card = cards?.[Math.min(index, cards.length - 1)];

  return card?.querySelector<HTMLElement>(CARD_FOCUS_TARGET) ?? null;
}

/** Saved community roadmaps: references to the originals, most recent first. */
export function LibraryView() {
  const actions = useCommunityActions();
  const [lastRemoved, setLastRemoved] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const removal = useRef<{
    id: string;
    title: string;
    index: number;
    focused: boolean;
  } | null>(null);

  // Number of cards shown when "Show more" was pressed; the first new card takes focus.
  const loadedBefore = useRef<number | null>(null);

  const library = useInfiniteQuery({
    queryKey: LIBRARY_KEY,
    queryFn: ({ pageParam }) => listLibraryPage(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

  const saved = useMemo(
    () => library.data?.pages.flatMap((page) => page.items),
    [library.data],
  );

  useEffect(() => {
    const removed = removal.current;
    if (!removed || !saved || saved.some((card) => card.id === removed.id)) {
      return;
    }

    removal.current = null;
    announce(`Removed “${removed.title}” from your library.`);

    if (removed.focused && document.activeElement === document.body) {
      const target =
        focusCardAt(list.current, removed.index) ?? heading.current;

      target?.focus();
    }
  }, [saved]);

  useEffect(() => {
    const before = loadedBefore.current;
    if (before === null || !saved || library.isFetchingNextPage) {
      return;
    }

    loadedBefore.current = null;

    // The error alert speaks for a failed page; focus stays on Show more to retry.
    if (library.isFetchNextPageError) {
      return;
    }

    const added = saved.length - before;
    if (added <= 0) {
      announce("All saved roadmaps are shown.");

      // The Show more button may have gone with its focus.
      if (document.activeElement === document.body) {
        focusCardAt(list.current, before - 1)?.focus();
      }

      return;
    }

    announce(
      `${added} more saved ${added === 1 ? "roadmap" : "roadmaps"} shown.`,
    );
    focusCardAt(list.current, before)?.focus();
  }, [saved, library.isFetchingNextPage, library.isFetchNextPageError]);

  function showMore() {
    if (!saved || library.isFetchingNextPage) {
      return;
    }

    loadedBefore.current = saved.length;
    void library.fetchNextPage();
  }

  const libraryActions = {
    ...actions,
    save: (id: string, favorited: boolean) => {
      const index = saved?.findIndex((card) => card.id === id) ?? -1;
      const card = saved?.[index];

      if (!favorited && card) {
        setLastRemoved({ id, title: card.title });

        removal.current = {
          id,
          title: card.title,
          index,
          focused: list.current?.contains(document.activeElement) ?? false,
        };
      }

      actions.save(id, favorited);
    },
  };

  return (
    <>
      <div className="space-y-1">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold">
          Your library
        </h1>
        <p className="text-sm text-muted-foreground">
          Roadmaps you saved from the community. Saving keeps a link to the
          original; it never copies it.
        </p>
      </div>

      {library.isPending && (
        <div
          aria-busy="true"
          aria-label="Loading your library"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {Array.from({ length: 3 }, (_, index) => (
            <Card key={index} skeleton className="h-56" />
          ))}
        </div>
      )}

      {library.error && !saved && (
        <LoadErrorAlert
          error={library.error}
          title="Your library could not load"
          onRetry={() => void library.refetch()}
        />
      )}

      <ActionError message={actions.error ?? actions.startError} />

      {lastRemoved &&
        saved &&
        !saved.some((card) => card.id === lastRemoved.id) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <p>Removed “{lastRemoved.title}” from your library.</p>
            <Button
              size="sm"
              variant="outline"
              disabled={actions.isSaving(lastRemoved.id)}
              onClick={() => {
                heading.current?.focus();
                actions.save(lastRemoved.id, true);
              }}
            >
              Undo
            </Button>
          </div>
        )}

      {saved && saved.length === 0 && !library.hasNextPage && (
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

      {saved && saved.length > 0 && (
        <ul
          ref={list}
          aria-label="Saved roadmaps"
          aria-busy={library.isFetchingNextPage}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {saved.map((card) => (
            <li key={card.id} data-roadmap-id={card.id}>
              <RoadmapCard card={card} actions={libraryActions} />
            </li>
          ))}
        </ul>
      )}

      {library.isFetchNextPageError && (
        <ActionError
          message={`More saved roadmaps could not load. ${toLearnerMessage(library.error)}`}
        />
      )}

      {saved && library.hasNextPage && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            loading={library.isFetchingNextPage}
            onClick={showMore}
          >
            Show more
          </Button>
        </div>
      )}
    </>
  );
}
