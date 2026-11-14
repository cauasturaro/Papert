const STORAGE_KEY = "papert:catalog-search";

/** Remembers the catalog query for this tab, so links back to the catalog restore it. */
export function rememberCatalogSearch(search: string) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, search);
  } catch {
    // Storage can be disabled; the plain catalog link still works.
  }
}

export function readCatalogSearch() {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
