import { describe, expect, it } from 'vitest';
import type { RoadmapDraft, SourceEvidence } from '../domain/roadmap-draft.js';
import { draftView } from './draft-presentation.js';

const createdAt = new Date('2026-11-01T10:00:00Z');
const updatedAt = new Date('2026-11-01T10:05:00Z');

function draft(overrides: Partial<RoadmapDraft> = {}): RoadmapDraft {
  return {
    workspaceId: 'workspace-1',
    goal: 'Learn TypeScript generics',
    level: 'beginner',
    status: 'open',
    executionId: null,
    outcome: null,
    recommendation: null,
    roadmap: null,
    createdAt,
    updatedAt,
    ...overrides,
  };
}

describe('draftView', () => {
  it('presents an open draft without failure or evidence', () => {
    const view = draftView(draft());

    expect(view).toEqual({
      workspaceId: 'workspace-1',
      goal: 'Learn TypeScript generics',
      level: 'beginner',
      status: 'open',
      executionId: null,
      failure: null,
      evidence: [],
      consulted: [],
      recommendation: null,
      canGenerate: false,
      roadmap: null,
      createdAt,
      updatedAt,
    });
  });

  it('unlocks generation once the community check is settled', () => {
    const settled = draft({
      recommendation: {
        executionId: 'execution-1',
        status: 'ready',
        matches: [],
        declined: false,
      },
    });

    expect(draftView(settled).canGenerate).toBe(true);
  });

  it('explains a failure reason and falls back to the generic message', () => {
    const failedWith = (reason: string) =>
      draft({
        status: 'failed',
        executionId: 'execution-1',
        outcome: { reason, executionId: 'execution-1' },
      });

    const cancelled = draftView(failedWith('cancelled')).failure;
    const timedOut = draftView(failedWith('timed_out')).failure;
    const generic = draftView(failedWith('failed')).failure;
    const unknown = draftView(failedWith('quota')).failure;

    expect(cancelled?.reason).toBe('cancelled');
    expect(cancelled?.message).toContain('Your goal and sources are kept');

    expect(timedOut?.reason).toBe('timed_out');
    expect(timedOut?.message).toContain('took too long');

    expect(unknown).toEqual({ reason: 'quota', message: generic?.message });
  });

  it('exposes evidence and consulted sources only for a generated roadmap', () => {
    const evidence: SourceEvidence[] = [
      {
        stepId: 'validate-input',
        sourceId: 'source-1',
        cite: 'Validate input at the boundary.',
        location: { page: 2 },
      },
    ];
    const consulted = [{ id: 'source-1', filename: 'notes.pdf' }];
    const generated = draft({
      status: 'generated',
      executionId: 'execution-1',
      outcome: {
        roadmapId: 'roadmap-1',
        executionId: 'execution-1',
        evidence,
        consulted,
      },
    });

    const view = draftView(generated);

    expect(view.failure).toBeNull();
    expect(view.evidence).toEqual(evidence);
    expect(view.consulted).toEqual(consulted);
    expect(view).not.toHaveProperty('outcome');
  });
});
