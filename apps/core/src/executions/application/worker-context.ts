import type { SyntaxReport } from '../../analysis/domain/syntax.js';
import type { ExecutionRequest } from '../domain/execution.js';
import type { ProgressionStep } from '../domain/attempt-progression.js';
import { recentTurns } from '../domain/tutor-context.js';
import type { TutorSource } from '../domain/tutor-context.js';

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
