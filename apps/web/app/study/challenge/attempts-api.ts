import type { Challenge } from "@/lib/roadmap";
import { studyRequest, type AttemptResult, type Workspace } from "../study-api";

export type Attempt = Workspace["attempts"][number];

/** An attempt from the history list: no file contents, plus its step position and title. */
export type AttemptSummary = {
  id: string;
  stepId: string;
  stepIndex: number;
  stepTitle: string | null;
  revision: number;
  challenge: Challenge;
  result: AttemptResult;
  createdAt: string;
};

export type AttemptPage = {
  items: AttemptSummary[];
  nextCursor: string | null;
};

/** Newest attempts first, without files; `cursor` is the last id of the previous page. */
export function attemptPage(
  workspaceId: string,
  options: { cursor?: string | null; limit?: number } = {},
) {
  const query = new URLSearchParams();

  if (options.cursor) {
    query.set("cursor", options.cursor);
  }

  if (options.limit) {
    query.set("limit", String(options.limit));
  }

  const suffix = query.size > 0 ? `?${query}` : "";

  return studyRequest<AttemptPage>(
    `workspaces/${workspaceId}/attempts${suffix}`,
  );
}

/** One attempt with its files. */
export function attemptDetail(workspaceId: string, attemptId: string) {
  return studyRequest<Attempt>(
    `workspaces/${workspaceId}/attempts/${attemptId}`,
  );
}
