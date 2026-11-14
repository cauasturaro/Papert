import type { Metadata } from "next";
import { Suspense } from "react";
import { HomeRoute } from "./home/home-route";
import { StudyPageSkeleton } from "./workspace/study-skeletons";

export const metadata: Metadata = {
  title: "Study",
};

// Old links carry ?roadmap=, ?workspace= or ?create=1, which are read on the client.
export default function StudyHomePage() {
  return (
    <Suspense fallback={<StudyPageSkeleton />}>
      <HomeRoute />
    </Suspense>
  );
}
