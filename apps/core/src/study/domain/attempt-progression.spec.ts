import { describe, expect, it } from 'vitest';
import {
  attemptOutcomeDecision,
  completedRoadmap,
} from './attempt-progression.js';

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
      completes: false,
    });
  });

  it('advances the active approved step, including roadmap completion', () => {
    const first = attemptOutcomeDecision(attempt, execution, position);
    const last = attemptOutcomeDecision(
      { ...attempt, stepId: 'last' },
      execution,
      { ...position, currentStep: 1 },
    );

    expect(first).toEqual({
      applies: true,
      advance: true,
      nextStep: 1,
      completes: false,
    });
    expect(last).toEqual({
      applies: true,
      advance: true,
      nextStep: 2,
      completes: true,
    });
  });

  it.each([
    { ...position, approved: false },
    { ...position, currentStep: 1 },
    { ...position, steps: [] },
  ])('records eligible outcomes without advancing: %j', (roadmap) => {
    const decision = attemptOutcomeDecision(attempt, execution, roadmap);

    expect(decision).toEqual({
      applies: true,
      advance: false,
      nextStep: null,
      completes: false,
    });
  });

  it('describes a completed roadmap with its distinct concepts in step order', () => {
    const roadmap = {
      id: 'roadmap',
      title: 'Hexagonal APIs',
      steps: [
        { concepts: ['ports', 'adapters'] },
        {},
        { concepts: ['adapters', 'testing'] },
      ],
    };

    const completed = completedRoadmap(roadmap, 'workspace');

    expect(completed).toEqual({
      roadmapId: 'roadmap',
      workspaceId: 'workspace',
      title: 'Hexagonal APIs',
      stepCount: 3,
      concepts: ['ports', 'adapters', 'testing'],
    });
  });
});
