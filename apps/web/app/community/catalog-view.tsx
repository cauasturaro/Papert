"use client";

import { Suspense } from "react";
import Link from "next/link";
import { SparklesIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button/button";
import { CatalogResults } from "./catalog-results";
import { CatalogSkeleton } from "./catalog-skeleton";

const CREATE_HREF = "/study/new";

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
