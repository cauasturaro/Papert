import { executionRequest } from "../execution-api";
import type { Execution } from "../execution-state";
import { studyRequest, type Level, type Roadmap } from "../study-api";
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
  roadmap: Roadmap | null;
};

export type StudyableRoadmap = {
  roadmap: Roadmap;
  workspace: { id: string; currentStep: number } | null;
};

export const LEVELS: { value: Level; label: string; hint: string }[] = [
  {
    value: "beginner",
    label: "Beginner",
    hint: "New to this stack; small steps and explained vocabulary.",
  },
  {
    value: "intermediate",
    label: "Intermediate",
    hint: "Writes basic code here; focus on structure and contracts.",
  },
  {
    value: "advanced",
    label: "Advanced",
    hint: "Fluent with the basics; focus on design trade-offs.",
  },
];

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

export function readExecution(executionId: string) {
  return executionRequest<Execution>(executionId);
}

export function cancelExecution(executionId: string) {
  return executionRequest<Execution>(`${executionId}/cancel`, {});
}
