"use client";

import { LoadErrorAlert } from "@/components/app/load-error-alert";
import { Button } from "@/components/ui/button/button";
import { ActionError } from "./action-error";
import { CatalogFilters } from "./catalog-filters";
import { RoadmapCard } from "./roadmap-card";
import { CatalogEmpty } from "./catalog-empty";
import { CatalogSkeleton } from "./catalog-skeleton";
import type { useCatalogResults } from "./use-catalog-results";

export function CatalogResultsView({
  query,
  actions,
  resultsHeading,
  catalog,
  navigate,
  goToPage,
  data,
  pages,
  empty,
  status,
}: ReturnType<typeof useCatalogResults>) {
  return (
    <>
      <div>
        <CatalogFilters query={query} onChange={navigate} />
      </div>

      <h2 ref={resultsHeading} tabIndex={-1} className="sr-only scroll-mt-20">
        Community roadmaps
      </h2>

      <p
        role="status"
        aria-live="polite"
        className="text-sm text-muted-foreground"
      >
        {status}
      </p>

      {catalog.error && (
        <LoadErrorAlert
          error={catalog.error}
          title="The catalog could not load"
          onRetry={() => void catalog.refetch()}
        />
      )}

      <ActionError message={actions.error ?? actions.startError} />

      {catalog.isPending && <CatalogSkeleton />}

      {empty && <CatalogEmpty kind={empty} />}

      {data && data.items.length > 0 && (
        <ul
          aria-label="Community roadmaps"
          aria-busy={catalog.isPlaceholderData}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {data.items.map((card) => (
            <li key={card.id}>
              <RoadmapCard card={card} actions={actions} />
            </li>
          ))}
        </ul>
      )}

      {data && pages > 1 && (
        <nav
          aria-label="Catalog pages"
          className="flex items-center justify-center gap-3"
        >
          <Button
            variant="outline"
            disabled={query.page <= 1 || catalog.isPlaceholderData}
            onClick={() => goToPage(query.page - 1)}
          >
            Previous
          </Button>

          <span className="text-sm tabular-nums">
            Page {query.page} of {pages}
          </span>

          <Button
            variant="outline"
            disabled={!data.hasMore || catalog.isPlaceholderData}
            onClick={() => goToPage(query.page + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  );
}
