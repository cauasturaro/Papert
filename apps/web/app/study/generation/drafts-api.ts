import type { Level } from "@/lib/roadmap";
import { executionRequest } from "../execution-api";
import type { Execution } from "../execution-state";
import { studyRequest, type Roadmap } from "../study-api";
import type { CitationLocation } from "../viewer/citations";

export type DraftStatus = "open" | "generating" | "generated" | "failed";

/** A generated step's link to the learner's source; private to the draft. */
export type Evidence = {
  stepId: string;
  sourceId: string;
  cite: string;
  location: CitationLocation;
};

export type RoadmapDraft = {
  workspaceId: string;
  goal: string;
  level: Level;
  status: DraftStatus;
  executionId: string | null;
  failure: { reason: string; message: string } | null;
  evidence: Evidence[];
  // Ready sources Core gave Seymour for the generation, named as they were then.
  consulted: { id: string; filename: string }[];
  recommendation: DraftRecommendation | null;
  // Core's rule: the community check finished with no matches, or the learner declined.
  canGenerate: boolean;
  roadmap: Roadmap | null;
};

/** The community check every draft goes through before a paid generation. */
export type DraftRecommendation = {
  executionId: string;
  status: "searching" | "ready" | "failed";
  matches: { roadmapId: string; similarity: number }[];
  // The learner chose to generate their own roadmap anyway.
  declined: boolean;
};

export type StudyableRoadmap = {
  roadmap: Roadmap;
  workspace: { id: string; currentStep: number } | null;
};

/** Cache key of one draft, shared by its page and its community check. */
export function draftKey(workspaceId: string) {
  return ["draft", workspaceId];
}

export function listRoadmaps() {
  return studyRequest<StudyableRoadmap[]>("roadmaps");
}

export function listDrafts() {
  return studyRequest<RoadmapDraft[]>("drafts");
}

export function getDraft(workspaceId: string) {
  return studyRequest<RoadmapDraft>(`drafts/${workspaceId}`);
}

export function createDraft(goal: string, level: Level) {
  return studyRequest<RoadmapDraft>("drafts", "POST", { goal, level });
}

export function discardDraft(workspaceId: string) {
  return studyRequest<RoadmapDraft>(`drafts/${workspaceId}`, "DELETE", {});
}

// The request key makes a retried click resolve to the same generation.
export function startGeneration(workspaceId: string, requestKey: string) {
  return executionRequest<Execution>(`workspaces/${workspaceId}`, {
    requestKey,
    kind: "generation",
  });
}

// Same request-key retry rule as generation; Seymour compares the goal with the catalog.
export function startRecommendation(workspaceId: string, requestKey: string) {
  return executionRequest<Execution>(`workspaces/${workspaceId}`, {
    requestKey,
    kind: "recommendation",
  });
}

export function declineRecommendation(workspaceId: string) {
  return studyRequest<RoadmapDraft>(
    `drafts/${workspaceId}/recommendation/decline`,
    "POST",
    {},
  );
}

export function readExecution(executionId: string) {
  return executionRequest<Execution>(executionId);
}

export function cancelExecution(executionId: string) {
  return executionRequest<Execution>(`${executionId}/cancel`, {});
}
