import type { Metadata } from "next";
import { Suspense } from "react";
import { StudyPageSkeleton } from "../../workspace/study-skeletons";
import { DraftRoute } from "./draft-route";

export const metadata: Metadata = {
  title: "Roadmap draft",
};

// The draft ID is read on the client; drafts are per-user and uncached.
export default function DraftRoadmapPage() {
  return (
    <Suspense fallback={<StudyPageSkeleton />}>
      <DraftRoute />
    </Suspense>
  );
}
