import { DomainError } from '../../common/domain/domain-error.js';
import type { SolutionProgress } from './solution-progress.js';

export class StudyError extends DomainError {}

export type Level = 'beginner' | 'intermediate' | 'advanced';

export type Step = {
  id: string;
  title: string;
  content: string;
  concepts?: string[];
  requires?: string[];
  challenge: {
    instructions: string;
    criteria: { id: string; description: string }[];
  };
};

export type RoadmapDefinition = {
  title: string;
  description: string;
  level?: Level;
  steps: Step[];
  starterFiles: Record<string, string>;
};

export type WorkspaceChanges = {
  revision: number;
  notes: string;
  files: Record<string, string>;
};

export type Roadmap = {
  id: string;
  authorName: string;
  authorUserId: string | null;
  definition: RoadmapDefinition;
};

export type StudyAttempt = {
  id: string;
  stepId: string;
  revision: number;
  files: Record<string, string>;
  challenge: Step['challenge'];
  result: unknown;
  createdAt: Date;
};

/** An attempt without its files, for history lists; files load one attempt at a time. */
export type StudyAttemptSummary = Omit<StudyAttempt, 'files'> & {
  stepIndex: number;
  stepTitle: string | null;
};

export type AttemptPage = {
  items: StudyAttemptSummary[];
  nextCursor: string | null;
};

export type SavedRevision = { id: string; revision: number };

export type Workspace = {
  id: string;
  roadmap: Roadmap;
  currentStep: number;
  revision: number;
  notes: string;
  files: Record<string, string>;
  session: { id: string; lastOpenedAt: Date };
  attempts: StudyAttempt[];
  // Solution guidance progress for the current step (the last one once completed).
  solution: SolutionProgress;
};

export type StudyableRoadmap = {
  roadmap: Roadmap;
  workspace: {
    id: string;
    currentStep: number;
    // Latest of opening, analyzing or asking Seymour; orders the study home.
    lastActivityAt: Date;
  } | null;
};

/** Started roadmaps by latest activity first, then the rest in their given order. */
export function byLastActivity(roadmaps: StudyableRoadmap[]) {
  const started = roadmaps.filter((entry) => entry.workspace !== null);
  const notStarted = roadmaps.filter((entry) => entry.workspace === null);

  started.sort(
    (left, right) =>
      right.workspace!.lastActivityAt.getTime() -
      left.workspace!.lastActivityAt.getTime(),
  );

  return [...started, ...notStarted];
}

/** The step whose progress the learner sees: the current one, or the last after completion. */
export function progressStepIndex(currentStep: number, stepCount: number) {
  return Math.max(0, Math.min(currentStep, stepCount - 1));
}
