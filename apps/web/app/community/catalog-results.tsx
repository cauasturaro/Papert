"use client";

import { CatalogResultsView } from "./catalog-results-view";
import { useCatalogResults } from "./use-catalog-results";

export function CatalogResults() {
  const results = useCatalogResults();

  return <CatalogResultsView {...results} />;
}
