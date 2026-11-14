"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button/button";
import { readCatalogSearch } from "./catalog-memory";

// The stored search only changes on the catalog page, never while this link is shown.
function subscribe() {
  return () => undefined;
}

/** Returns to the catalog with the search, filters and page the learner left. */
export function BackToCatalog() {
  const search = useSyncExternalStore(subscribe, readCatalogSearch, () => "");
  const href = search ? `/community?${search}` : "/community";

  return (
    <Link
      href={href}
      className={buttonVariants({ variant: "ghost", className: "w-fit" })}
    >
      ← All community roadmaps
    </Link>
  );
}
