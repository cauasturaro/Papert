import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button/button";
import { DetailsLoading, DetailsView } from "../details-view";

// The roadmap ID is read on the client; every community view is per-user and uncached.
export default function CommunityRoadmapPage() {
  return (
    <>
      <Link
        href="/community"
        className={buttonVariants({ variant: "ghost", className: "w-fit" })}
      >
        ← All community roadmaps
      </Link>

      <Suspense fallback={<DetailsLoading />}>
        <DetailsView />
      </Suspense>
    </>
  );
}
