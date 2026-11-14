"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { rememberCatalogSearch } from "./catalog-memory";
import {
  catalogResultStatus,
  emptyKind,
  pageCount,
  paramsFromQuery,
  queryFromParams,
} from "./catalog-state";
import { listCatalog, type CatalogQuery } from "./community-api";
import { catalogKey } from "./community-keys";
import { useCommunityActions } from "./use-community-actions";

export function useCatalogResults() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const query = queryFromParams(new URLSearchParams(params.toString()));
  const actions = useCommunityActions();
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const pendingPage = useRef<number | null>(null);
  const search = params.toString();

  // Links back from a roadmap's page return to this exact search.
  useEffect(() => {
    rememberCatalogSearch(search);
  }, [search]);

  // The previous page stays visible while the next one loads.
  const catalog = useQuery({
    queryKey: catalogKey(query),
    queryFn: () => listCatalog(query),
    placeholderData: keepPreviousData,
  });

  // Each applied search and page is a history entry, so Back restores the previous results.
  function navigate(next: CatalogQuery, options?: { replace?: boolean }) {
    if (
      next.q !== query.q ||
      next.level !== query.level ||
      next.sort !== query.sort
    ) {
      pendingPage.current = null;
    }

    const nextSearch = paramsFromQuery(next);
    const href = nextSearch ? `${pathname}?${nextSearch}` : pathname;

    if (options?.replace) {
      router.replace(href, { scroll: false });

      return;
    }

    router.push(href, { scroll: false });
  }

  function goToPage(page: number) {
    pendingPage.current = page;
    navigate({ ...query, page });
  }

  const data = catalog.data;
  const pages = data ? pageCount(data.total, data.pageSize) : 1;
  const empty: "empty-catalog" | "no-results" | null = data ? emptyKind(query, data.total) : null;
  const beyondLastPage =
    !!data && !catalog.isPlaceholderData && query.page > pages;

  // A stale link or a shrinking catalog can point past the end; show the last page instead.
  const showLastPage = useEffectEvent(() => {
    const lastPage = paramsFromQuery({ ...query, page: pages });
    const href = lastPage ? `${pathname}?${lastPage}` : pathname;

    if (pendingPage.current !== null) {
      pendingPage.current = pages;
    }

    router.replace(href, { scroll: false });
  });

  useEffect(() => {
    if (beyondLastPage) {
      showLastPage();
    }
  }, [beyondLastPage, pages]);

  useEffect(() => {
    if (catalog.error) {
      pendingPage.current = null;

      return;
    }

    if (
      !data ||
      catalog.isPlaceholderData ||
      beyondLastPage ||
      data.page !== query.page ||
      pendingPage.current !== query.page
    ) {
      return;
    }

    pendingPage.current = null;
    resultsHeading.current?.focus();
    resultsHeading.current?.scrollIntoView({ block: "start" });
  }, [
    data,
    catalog.isPlaceholderData,
    catalog.error,
    beyondLastPage,
    query.page,
  ]);

  let status = "Loading community roadmaps…";

  if (data) {
    status = `${data.total} ${data.total === 1 ? "roadmap" : "roadmaps"}`;

    if (!catalog.isPlaceholderData) {
      status = catalogResultStatus(
        data.total,
        data.page,
        data.pageSize,
        data.items.length,
      );
    }
  }

  // While the next search loads, the previous correction no longer applies.
  const correction = catalog.isPlaceholderData ? null : data?.correctedQuery;

  if (correction) {
    status = `${status}. No matches for “${query.q}”, showing results for “${correction}”`;
  }

  if (catalog.error) {
    status = "";
  }

  return {
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
  };
}
