import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import type { ExecutionRequest } from '../domain/execution.js';
import type { ProgressionStep } from '../domain/ports/execution-study-progression.js';
import { recentTurns } from '../domain/tutor-context.js';
import type { TutorSource } from '../domain/tutor-context.js';
import type {
  GenerationLevel,
  GenerationRequest,
} from '../domain/roadmap-drafts.js';

export function buildWorkerContext(
  input: ExecutionRequest,
  facts: {
    sessionId: string;
    workspaceId: string;
    files: Record<string, string>;
    step: ProgressionStep;
    objective: string;
    solutionAllowed: boolean;
    recentResults: { revision: number; result: unknown }[];
    completed: { input: unknown; text: string }[];
    sources: TutorSource[];
    attemptId?: string;
    syntax?: SyntaxReport;
  },
) {
  const { step, syntax, attemptId } = facts;

  return {
    ...input,
    sessionId: facts.sessionId,
    stepId: step.id,
    files: facts.files,
    challenge: step.challenge,
    ...(input.mode
      ? {
          objective: facts.objective,
          stepTitle: step.title,
          solutionAllowed: facts.solutionAllowed,
          recentResults: facts.recentResults,
          workspaceId: facts.workspaceId,
          sources: facts.sources,
          recentTurns: recentTurns(facts.completed),
        }
      : {}),
    ...(attemptId && syntax
      ? {
          attemptId,
          objective: facts.objective,
          stepTitle: step.title,
          syntax: {
            coverage: syntax.coverage,
            checked: syntax.checked,
            unchecked: syntax.unchecked,
          },
        }
      : {}),
  };
}

/** Seymour's GenerationContext: the draft's goal/level and its ready sources, nothing else. */
export function buildGenerationContext(
  input: GenerationRequest,
  facts: {
    sessionId: string;
    workspaceId: string;
    goal: string;
    level: GenerationLevel;
    sources: TutorSource[];
  },
) {
  return {
    ...input,
    sessionId: facts.sessionId,
    workspaceId: facts.workspaceId,
    goal: facts.goal,
    level: facts.level,
    sources: facts.sources,
  };
}
