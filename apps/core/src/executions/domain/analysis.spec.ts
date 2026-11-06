import type { Evaluation } from './evaluation.js';
import { describe, expect, it } from 'vitest';

import {
  analysisOutcome,
  assertAnalysisRetry,
  evaluatedAnalysis,
} from './analysis.js';

const now = new Date('2026-11-03T23:59:59Z');

describe('analysis', () => {
  it.each(['approved', 'needs_work'])(
    'rejects a finalized analysis: %s',
    (status) => {
      expect(() => assertAnalysisRetry({ status })).toThrow('already analyzed');
    },
  );

  it('rejects a running analysis but permits failed, cancelled and timed-out retries', () => {
    const state = { status: 'evaluating', executionId: 'execution' };

    expect(() => assertAnalysisRetry(state, 'running')).toThrow(
      'already running',
    );
    expect(() => assertAnalysisRetry(state, 'queued')).toThrow(
      'already running',
    );
    expect(() => assertAnalysisRetry(state)).not.toThrow();

    for (const status of ['failed', 'cancelled', 'timed_out']) {
      expect(() => assertAnalysisRetry(state, status)).not.toThrow();
    }
  });

  it.each(['met', 'not_met'] as const)(
    'records a valid evaluation with criterion status %s',
    (criterionStatus) => {
      const snapshot = {
        id: '4ca755d9-108c-497c-b9a0-1dab240cb901',
        stepId: 'step',
        revision: 1,
        criteria: ['criterion'],
      };
      const evaluation: Evaluation = {
        attemptId: snapshot.id,
        stepId: snapshot.stepId,
        revision: snapshot.revision,
        summary: 'Checked',
        criteria: [
          { id: 'criterion', status: criterionStatus, feedback: 'Feedback' },
        ],
        findings: [],
        hints: ['Review the boundary.'],
      };

      const outcome = analysisOutcome(
        snapshot,
        'execution',
        'completed',
        evaluation,
        now,
      );

      expect(outcome.approved).toBe(criterionStatus === 'met');
      expect(outcome.result).toEqual({
        status: criterionStatus === 'met' ? 'approved' : 'needs_work',
        executionId: 'execution',
        evaluatedAt: now.toISOString(),
        evaluation,
      });
    },
  );

  it('records missing or malformed evaluation as failed without approval', () => {
    const snapshot = {
      id: 'attempt',
      stepId: 'step',
      revision: 1,
      criteria: ['criterion'],
    };

    const missing = analysisOutcome(
      snapshot,
      'execution',
      'completed',
      undefined,
      now,
    );
    const cancelled = analysisOutcome(
      snapshot,
      'execution',
      'cancelled',
      undefined,
      now,
    );
    const invalid = analysisOutcome(
      snapshot,
      'execution',
      'completed',
      null,
      now,
    );

    expect(missing.result).toMatchObject({
      status: 'analysis_failed',
      reason: 'no_evaluation',
    });
    expect(cancelled.result).toMatchObject({ reason: 'cancelled' });
    expect(invalid).toMatchObject({
      approved: false,
      result: { reason: 'invalid_output' },
    });
  });
});

describe('evaluated analysis', () => {
  const execution = {
    id: 'execution',
    userId: 'learner',
    workspaceId: 'workspace',
  };
  const completedRoadmap = {
    roadmapId: 'roadmap',
    workspaceId: 'workspace',
    title: 'Roadmap',
    stepCount: 2,
    concepts: [],
  };

  it.each(['approved', 'needs_work'] as const)(
    'reports an evaluation Core accepted as study activity: %s',
    (status) => {
      const recorded = { status, completedRoadmap: null };

      const analysis = evaluatedAnalysis(execution, recorded, now);

      expect(analysis).toEqual({
        userId: 'learner',
        executionId: 'execution',
        workspaceId: 'workspace',
        approved: status === 'approved',
        evaluatedAt: now,
        completedRoadmap: null,
      });
    },
  );

  it('carries the completion Study recorded', () => {
    const recorded = { status: 'approved' as const, completedRoadmap };

    const analysis = evaluatedAnalysis(execution, recorded, now);

    expect(analysis?.completedRoadmap).toBe(completedRoadmap);
  });

  it.each([
    null,
    { status: 'analysis_failed' as const, completedRoadmap: null },
  ])('ignores a failed or unrelated outcome: %j', (recorded) => {
    expect(evaluatedAnalysis(execution, recorded, now)).toBeNull();
  });
});
