"use client";

import { useEffect, useEffectEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { StudyPageFrame } from "../shell/study-page-frame";
import { StudyStart } from "./study-start";
import { useStudy, workspaceHref } from "../use-study";

/**
 * Old links: `?roadmap=` starts or resumes a roadmap, `?workspace=` opens one and
 * `?create=1` opens the creator. Each now has its own address, so the request is
 * forwarded there instead of handled in place.
 */
function useLegacyLinks(start: (roadmapId: string) => void) {
  const router = useRouter();
  const params = useSearchParams();
  const roadmap = params.get("roadmap");
  const workspace = params.get("workspace");
  const create = params.get("create") === "1";

  const followLegacyLink = useEffectEvent(() => {
    if (workspace) {
      router.replace(workspaceHref(workspace));
      return;
    }

    if (create) {
      router.replace("/study/new");
      return;
    }

    if (roadmap) {
      // Starting pushes the workspace address once the server answers.
      router.replace("/study");
      start(roadmap);
    }
  });

  useEffect(() => {
    followLegacyLink();
  }, [roadmap, workspace, create]);
}

export function HomeRoute() {
  const router = useRouter();
  const study = useStudy();

  useLegacyLinks(study.start);

  return (
    <StudyPageFrame>
      <StudyStart
        study={study}
        onCreate={() => router.push("/study/new")}
        onOpenDraft={(id) =>
          router.push(`/study/drafts/${encodeURIComponent(id)}`)
        }
      />
    </StudyPageFrame>
  );
}
