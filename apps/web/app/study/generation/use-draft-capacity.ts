"use client";

import { useQuery } from "@tanstack/react-query";
import { studyKeys } from "../study-keys";
import { ACTIVE_DRAFT_LIMIT, isActiveDraft, listDrafts } from "./drafts-api";

export function useDraftCapacity() {
  const drafts = useQuery({
    queryKey: studyKeys.drafts(),
    queryFn: listDrafts,
  });
  const activeDrafts = (drafts.data ?? []).filter(isActiveDraft);
  const atLimit = activeDrafts.length >= ACTIVE_DRAFT_LIMIT;

  return { drafts, activeDrafts, atLimit };
}
