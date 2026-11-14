"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { errorKind } from "@/lib/api/learner-error";
import { listRoadmaps } from "../generation/drafts-api";
import { orderByLastActivity } from "../generation/roadmap-order";
import { useDraftCapacity } from "../generation/use-draft-capacity";
import { studyKeys } from "../study-keys";
import type { useStudy } from "../use-study";

export function useStudyHome(study: ReturnType<typeof useStudy>) {
  // The roadmap whose Start or Resume was clicked last; its card shows the outcome.
  const [clickedId, setClickedId] = useState<string | null>(null);

  const roadmaps = useQuery({
    queryKey: studyKeys.roadmaps(),
    queryFn: listRoadmaps,
  });
  const { drafts, activeDrafts, atLimit: atDraftLimit } = useDraftCapacity();

  const signedOut =
    study.signedOut ||
    errorKind(roadmaps.error) === "session_expired" ||
    errorKind(drafts.error) === "session_expired";

  const ordered = orderByLastActivity(roadmaps.data ?? []);
  const recent = ordered[0]?.workspace ? ordered[0] : null;
  const others = recent ? ordered.slice(1) : ordered;
  const firstVisit =
    !!roadmaps.data && !recent && !!drafts.data && drafts.data.length === 0;

  function start(roadmapId: string) {
    setClickedId(roadmapId);
    study.start(roadmapId);
  }

  function startingFor(roadmapId: string) {
    return study.busy && clickedId === roadmapId;
  }

  function errorFor(roadmapId: string) {
    if (study.busy || clickedId !== roadmapId || !study.message) {
      return null;
    }

    return study.message;
  }

  return {
    roadmaps,
    drafts,
    signedOut,
    recent,
    others,
    firstVisit,
    activeDrafts,
    atDraftLimit,
    start,
    startingFor,
    errorFor,
  };
}
