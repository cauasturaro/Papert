"use client";

import { useRouter } from "next/navigation";
import { RoadmapCreator } from "../generation/roadmap-creator";
import { StudyPageFrame } from "../shell/study-page-frame";

export function CreatorRoute() {
  const router = useRouter();

  return (
    <StudyPageFrame>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-start justify-center overflow-auto bg-muted/40 p-4 sm:p-6"
      >
        <div className="w-full max-w-2xl">
          <RoadmapCreator
            onCreated={(draftId) =>
              router.push(`/study/drafts/${encodeURIComponent(draftId)}`)
            }
            onCancel={() => router.push("/study")}
          />
        </div>
      </main>
    </StudyPageFrame>
  );
}
