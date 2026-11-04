import { describe, expect, it } from 'vitest';
import { buildWorkerContext } from './worker-context.js';
import { rateWindowStart } from '../domain/policy.js';
import type { ExecutionRequest } from '../domain/execution.js';
import type { SyntaxReport } from '../../analysis/domain/syntax.js';

const input: ExecutionRequest = {
  requestKey: 'key',
  kind: 'chat',
  revision: 3,
  prompt: 'Help',
};
const facts = {
  sessionId: 'session',
  workspaceId: 'workspace',
  files: { 'main.ts': 'const n = 1;' },
  step: {
    id: 'step',
    title: 'Variables',
    challenge: {
      instructions: 'Declare n',
      criteria: [{ id: 'criterion', description: 'n exists' }],
    },
  },
  objective: 'Learn TypeScript',
  solutionAllowed: true,
  recentResults: [{ revision: 2, result: { status: 'needs_work' } }],
  completed: [
    {
      input: { kind: 'chat', mode: 'doubt', prompt: 'Earlier' },
      text: 'A hint',
    },
  ],
  sources: [{ id: 'source', filename: 'guide.pdf', format: 'pdf' as const }],
};

describe('Admitted worker context', () => {
  it('keeps transport jobs limited to their saved snapshot', () => {
    const result = buildWorkerContext(input, facts);

    expect(result).toEqual({
      ...input,
      sessionId: facts.sessionId,
      stepId: facts.step.id,
      files: facts.files,
      challenge: facts.step.challenge,
    });
  });

  it('builds tutor context from locked facts', () => {
    const result = buildWorkerContext(
      { ...input, mode: 'doubt', effort: 'low' },
      facts,
    );

    expect(result).toMatchObject({
      objective: facts.objective,
      stepTitle: facts.step.title,
      solutionAllowed: true,
      recentResults: facts.recentResults,
      workspaceId: facts.workspaceId,
      sources: facts.sources,
      recentTurns: [{ prompt: 'Earlier', answer: 'A hint' }],
    });
    expect(result).not.toHaveProperty('attemptId');
  });

  it('includes analysis association and syntax coverage without diagnostics', () => {
    const syntax: SyntaxReport = {
      status: 'passed',
      coverage: 'complete',
      checked: [{ path: 'main.ts', language: 'typescript' }],
      unchecked: [],
      diagnostics: [],
    };

    const result = buildWorkerContext(
      { ...input, kind: 'analysis' },
      { ...facts, attemptId: 'attempt', syntax },
    );

    expect(result).toMatchObject({
      attemptId: 'attempt',
      objective: facts.objective,
      stepTitle: facts.step.title,
      syntax: {
        coverage: syntax.coverage,
        checked: syntax.checked,
        unchecked: [],
      },
    });
    expect(result.syntax).not.toHaveProperty('diagnostics');
    expect(result).not.toHaveProperty('recentTurns');
  });

  it('uses an exact rolling minute across UTC midnight without mutating the clock', () => {
    const now = new Date('2026-11-03T00:00:30.123Z');

    const start = rateWindowStart(now);

    expect(start.toISOString()).toBe('2026-11-02T23:59:30.123Z');
    expect(now.toISOString()).toBe('2026-11-03T00:00:30.123Z');
  });
});
