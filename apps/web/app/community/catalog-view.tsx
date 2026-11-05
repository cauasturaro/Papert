"use client";

import Link from "next/link";
import { Suspense, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { Card } from "@/components/ui/card/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import { SearchIcon, SparklesIcon, UsersIcon } from "@/components/icons";
import { CatalogFilters } from "./catalog-filters";
import {
  emptyKind,
  pageCount,
  paramsFromQuery,
  queryFromParams,
} from "./catalog-state";
import { listCatalog, type CatalogQuery } from "./community-api";
import { catalogKey } from "./community-keys";
import { LoadErrorAlert } from "@/components/app/load-error-alert";
import { RoadmapCard } from "./roadmap-card";
import { useCommunityActions } from "./use-community-actions";

const CREATE_HREF = "/study?create=1";

function CatalogEmpty({ kind }: { kind: "empty-catalog" | "no-results" }) {
  const searching = kind === "no-results";

  return (
    <Card>
      <EmptyState size="lg">
        <EmptyStateIcon>
          {searching ? <SearchIcon /> : <UsersIcon />}
        </EmptyStateIcon>

        <EmptyStateTitle>
          {searching
            ? "No roadmaps match your search"
            : "No community roadmaps yet"}
        </EmptyStateTitle>

        <EmptyStateDescription>
          {searching
            ? "Try other words or another level, or create a roadmap made for your goal."
            : "Be the first: create a roadmap for your goal and publish it."}
        </EmptyStateDescription>

        <EmptyStateActions>
          <Link href={CREATE_HREF} className={buttonVariants()}>
            <SparklesIcon />
            Create a roadmap
          </Link>
        </EmptyStateActions>
      </EmptyState>
    </Card>
  );
}

function CatalogSkeleton() {
  return (
    <div
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index} skeleton className="h-56" />
      ))}
    </div>
  );
}

/** Community catalog: the heading renders at once; the URL-driven results stream in. */
export function CatalogView() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Community roadmaps</h1>
          <p className="text-sm text-muted-foreground">
            Roadmaps learners and Papert published. Starting one gives you your
            own private workspace.
          </p>
        </div>

        <Link
          href={CREATE_HREF}
          className={buttonVariants({ variant: "outline" })}
        >
          <SparklesIcon />
          Create a roadmap
        </Link>
      </div>

      <Suspense fallback={<CatalogSkeleton />}>
        <CatalogResults />
      </Suspense>
    </>
  );
}

/** Search, level, order and pages live in the URL. */
function CatalogResults() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = queryFromParams(new URLSearchParams(params.toString()));
  const actions = useCommunityActions();

  // The previous page stays visible while the next one loads.
  const catalog = useQuery({
    queryKey: catalogKey(query),
    queryFn: () => listCatalog(query),
    placeholderData: keepPreviousData,
    retry: false,
  });

  function navigate(next: CatalogQuery) {
    const search = paramsFromQuery(next);

    router.replace(search ? `${pathname}?${search}` : pathname, {
      scroll: false,
    });
  }

  const data = catalog.data;
  const pages = data ? pageCount(data.total, data.pageSize) : 1;
  const empty = data ? emptyKind(query, data.total) : null;
  const beyondLastPage =
    !!data && !catalog.isPlaceholderData && query.page > pages;

  // A stale link or a shrinking catalog can point past the end; show the last page instead.
  useEffect(() => {
    if (beyondLastPage) {
      navigate({ ...query, page: pages });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beyondLastPage, pages]);

  let status = "Loading community roadmaps…";

  if (data) {
    status = `${data.total} ${data.total === 1 ? "roadmap" : "roadmaps"}`;
  }

  if (catalog.error) {
    status = "";
  }

  return (
    <>
      <CatalogFilters key={query.q} query={query} onChange={navigate} />

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

      {actions.error && (
        <p role="alert" className="text-sm text-destructive">
          {actions.error}
        </p>
      )}

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
            onClick={() => navigate({ ...query, page: query.page - 1 })}
          >
            Previous
          </Button>

          <span className="text-sm tabular-nums">
            Page {query.page} of {pages}
          </span>

          <Button
            variant="outline"
            disabled={!data.hasMore || catalog.isPlaceholderData}
            onClick={() => navigate({ ...query, page: query.page + 1 })}
          >
            Next
          </Button>
        </nav>
      )}
    </>
  );
}
