import { describe, expect, it } from 'vitest';

import {
  activeStudyStep,
  admissionBudget,
  assertRateLimit,
  assertSameDraftRequest,
  assertSameRequest,
  assertSavedRevision,
  assertSavedSelection,
  assertSolutionEligible,
  rateLimitWait,
  solutionEligible,
  studyStepFor,
} from './admission.js';

import type { ExecutionRequest } from '../execution.js';

const request: ExecutionRequest = {
  requestKey: 'request',
  kind: 'chat',
  revision: 1,
  prompt: 'Help',
};

describe('admission', () => {
  it('selects the request budget before an attempt exists and requires an active study context', () => {
    expect(admissionBudget({ kind: 'chat' })).toBe(1000);
    expect(admissionBudget({ kind: 'chat', mode: 'doubt' })).toBe(8000);
    expect(admissionBudget({ kind: 'analysis' })).toBe(8000);
    expect(activeStudyStep({ id: 'step' })).toEqual({ id: 'step' });
    expect(() => activeStudyStep(undefined)).toThrow('No active study step.');
    expect(() => activeStudyStep({ id: 'step' }, false)).toThrow(
      'No active study step.',
    );
  });

  it('matches idempotent requests including optional context and workspace', () => {
    const previous = { workspaceId: 'workspace', input: request };

    expect(() =>
      assertSameRequest(previous, 'workspace', request),
    ).not.toThrow();
    expect(() => assertSameRequest(previous, 'other', request)).toThrow(
      'different request',
    );
    expect(() =>
      assertSameRequest(previous, 'workspace', {
        ...request,
        prompt: 'Changed',
      }),
    ).toThrow('different request');
    expect(() =>
      assertSameRequest(previous, 'workspace', {
        ...request,
        sourceIds: ['source'],
      }),
    ).toThrow('different request');
    expect(() => assertSavedRevision(1, 2)).toThrow('Save and reload');
  });

  it('validates saved files and selection bounds', () => {
    const files = { 'main.ts': 'abc', 'empty/': '' };
    const selected = {
      ...request,
      activeFile: 'main.ts',
      selection: { start: 0, end: 3 },
    };

    expect(() => assertSavedSelection(selected, files)).not.toThrow();
    expect(() =>
      assertSavedSelection({ ...selected, activeFile: 'missing.ts' }, files),
    ).toThrow('Select a file');
    expect(() =>
      assertSavedSelection({ ...selected, activeFile: 'empty/' }, files),
    ).toThrow('Select a file');
    expect(() =>
      assertSavedSelection(
        { ...selected, selection: { start: 3, end: 2 } },
        files,
      ),
    ).toThrow('outside');
    expect(() =>
      assertSavedSelection(
        { ...selected, selection: { start: 0, end: 4 } },
        files,
      ),
    ).toThrow('outside');
  });

  it('requires three attempts only for solution guidance', () => {
    expect(solutionEligible(2)).toBe(false);
    expect(solutionEligible(3)).toBe(true);
    expect(() => assertSolutionEligible('solution', false)).toThrow(
      'three analyzed attempts',
    );
    expect(() => assertSolutionEligible('review', false)).not.toThrow();
  });

  it('enforces the execution rate limit', () => {
    expect(() => assertRateLimit(9)).not.toThrow();
    expect(() => assertRateLimit(10)).toThrow('last minute');
  });

  it('reuses a draft request key only for the same kind, effort and workspace', () => {
    const previous = {
      workspaceId: 'workspace',
      input: { kind: 'recommendation' as const, requestKey: 'key' },
    };

    expect(() =>
      assertSameDraftRequest(previous, 'workspace', {
        kind: 'recommendation',
      }),
    ).not.toThrow();

    expect(() =>
      assertSameDraftRequest(previous, 'workspace', { kind: 'generation' }),
    ).toThrow('different request');
    expect(() =>
      assertSameDraftRequest(previous, 'other', { kind: 'recommendation' }),
    ).toThrow('different request');
  });

  it('waits until the oldest request leaves the rate window', () => {
    const now = new Date('2026-11-03T12:00:30.000Z');

    expect(rateLimitWait(new Date('2026-11-03T12:00:00.000Z'), now)).toBe(30);
    expect(rateLimitWait(new Date('2026-11-03T11:59:30.000Z'), now)).toBe(1);
    expect(rateLimitWait(null, now)).toBe(60);

    let failure: unknown;

    try {
      assertRateLimit(10, 30);
    } catch (error) {
      failure = error;
    }

    expect((failure as { retryAfterSeconds?: number }).retryAfterSeconds).toBe(
      30,
    );
  });

  it('keeps tutoring on the last step after the roadmap is completed', () => {
    const steps = [{ id: 'first' }, { id: 'last' }];
    const question = { kind: 'chat' as const, mode: 'doubt' as const };

    expect(studyStepFor(steps, 0, question)).toEqual({ id: 'first' });
    expect(studyStepFor(steps, 2, question)).toEqual({ id: 'last' });
    expect(studyStepFor(steps, 2, { kind: 'chat', mode: 'teaching' })).toEqual({
      id: 'last',
    });

    expect(() => studyStepFor(steps, 2, { kind: 'analysis' })).toThrow(
      'nothing left to check',
    );
    expect(() =>
      studyStepFor(steps, 2, { kind: 'chat', mode: 'solution' }),
    ).toThrow('completed this roadmap');
    expect(() => studyStepFor(steps, 0, question, false)).toThrow(
      'No active study step.',
    );
  });
});
