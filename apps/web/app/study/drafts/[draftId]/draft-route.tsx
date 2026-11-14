"use client";

import { useParams, useRouter } from "next/navigation";
import { DraftPage } from "../../generation/draft-page";
import { StudyPageFrame } from "../../shell/study-page-frame";
import { useStudy } from "../../use-study";

export function DraftRoute() {
  const { draftId } = useParams<{ draftId: string }>();
  const router = useRouter();
  const study = useStudy();

  return (
    <StudyPageFrame>
      <DraftPage
        key={draftId}
        workspaceId={draftId}
        onBack={() => router.push("/study")}
        onStudy={study.start}
        starting={study.busy}
        startError={study.message || null}
      />
    </StudyPageFrame>
  );
}
