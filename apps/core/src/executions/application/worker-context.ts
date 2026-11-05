import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import type { ExecutionRequest } from '../domain/execution.js';
import type { ProgressionStep } from '../domain/ports/execution-study-progression.js';
import type { SummaryFold } from '../domain/conversation-window.js';
import type {
  TutorNote,
  TutorSummary,
} from '../domain/ports/execution-memory.js';
import type { TutorSource, TutorTurn } from '../domain/tutor-context.js';
import type {
  GenerationLevel,
  GenerationRequest,
} from '../domain/roadmap-drafts.js';
import type {
  RecommendationCandidate,
  RecommendationRequest,
} from '../domain/recommendation.js';

/** L2 and L3 context of a tutor request, chosen by Core at admission. */
export type TutorMemoryContext = {
  conversationId: string;
  summary: TutorSummary | null;
  recentTurns: TutorTurn[];
  foldTurns: TutorTurn[];
  // Core-only cursor of the folded turns; Seymour ignores it, settlement reads it back.
  summaryFold: SummaryFold | null;
  memory: TutorNote[];
};

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
    memory?: TutorMemoryContext;
    sources: TutorSource[];
    attemptId?: string;
    syntax?: SyntaxReport;
  },
) {
  const { step, syntax, attemptId, memory } = facts;

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
          ...(memory
            ? {
                conversationId: memory.conversationId,
                recentTurns: memory.recentTurns,
                foldTurns: memory.foldTurns,
                memory: memory.memory,
                ...(memory.summary ? { summary: memory.summary } : {}),
                ...(memory.summaryFold
                  ? { summaryFold: memory.summaryFold }
                  : {}),
              }
            : {}),
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

/** Seymour's RecommendationContext: the draft's goal/level and public catalog text only. */
export function buildRecommendationContext(
  input: RecommendationRequest,
  facts: {
    sessionId: string;
    goal: string;
    level: GenerationLevel;
    candidates: RecommendationCandidate[];
  },
) {
  return {
    ...input,
    sessionId: facts.sessionId,
    goal: facts.goal,
    level: facts.level,
    candidates: facts.candidates,
  };
}
