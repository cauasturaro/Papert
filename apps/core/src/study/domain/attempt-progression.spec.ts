import { describe, expect, it } from 'vitest';
import { attemptOutcomeDecision } from './attempt-progression.js';

const attempt = {
  workspaceId: 'workspace',
  stepId: 'first',
  state: { status: 'evaluating', executionId: 'execution' },
};
const execution = { workspaceId: 'workspace', executionId: 'execution' };
const position = {
  approved: true,
  currentStep: 0,
  steps: [{ id: 'first' }, { id: 'last' }],
};

describe('Study outcome progression', () => {
  it.each([
    null,
    { ...attempt, workspaceId: 'other' },
    { ...attempt, state: null },
    { ...attempt, state: { status: 'approved', executionId: 'execution' } },
    { ...attempt, state: { status: 'evaluating', executionId: 'other' } },
  ])('ignores an unrelated or already settled attempt: %j', (locked) => {
    const decision = attemptOutcomeDecision(locked, execution, position);

    expect(decision).toEqual({
      applies: false,
      advance: false,
      nextStep: null,
    });
  });

  it('advances the active approved step, including roadmap completion', () => {
    const first = attemptOutcomeDecision(attempt, execution, position);
    const last = attemptOutcomeDecision(
      { ...attempt, stepId: 'last' },
      execution,
      { ...position, currentStep: 1 },
    );

    expect(first).toEqual({ applies: true, advance: true, nextStep: 1 });
    expect(last).toEqual({ applies: true, advance: true, nextStep: 2 });
  });

  it.each([
    { ...position, approved: false },
    { ...position, currentStep: 1 },
    { ...position, steps: [] },
  ])('records eligible outcomes without advancing: %j', (roadmap) => {
    const decision = attemptOutcomeDecision(attempt, execution, roadmap);

    expect(decision).toEqual({ applies: true, advance: false, nextStep: null });
  });
});
