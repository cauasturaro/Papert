import { DomainError } from '../../common/domain/domain-error.js';

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

export type Workspace = {
  id: string;
  roadmap: Roadmap;
  currentStep: number;
  revision: number;
  notes: string;
  files: Record<string, string>;
  session: { id: string; lastOpenedAt: Date };
  attempts: StudyAttempt[];
};

export type StudyableRoadmap = {
  roadmap: Roadmap;
  workspace: { id: string; currentStep: number } | null;
};
