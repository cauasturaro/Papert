import { describe, expect, it } from 'vitest';

import {
  activeStudyStep,
  admissionBudget,
  assertRateLimit,
  assertSameRequest,
  assertSavedRevision,
  assertSavedSelection,
  assertSolutionEligible,
  solutionEligible,
} from './admission.js';

import type { ExecutionRequest } from './execution.js';

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
      'three saved attempts',
    );
    expect(() => assertSolutionEligible('review', false)).not.toThrow();
  });

  it('enforces the execution rate limit', () => {
    expect(() => assertRateLimit(9)).not.toThrow();
    expect(() => assertRateLimit(10)).toThrow('one minute');
  });
});
