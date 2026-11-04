import { describe, expect, it } from 'vitest';
import {
  ACTIVE_DRAFT_LIMIT,
  activeDraft,
  assertDiscardAllowed,
  assertDraftCapacity,
  assertGenerationAllowed,
  authorizedEvidence,
  generatedRoadmapProblem,
  generationDecision,
} from './roadmap-draft.js';
import type { GeneratedRoadmap } from './roadmap-draft.js';
import type { RoadmapDefinition } from './study.js';

const LIVE = '11111111-1111-4111-8111-111111111111';
const DELETED = '22222222-2222-4222-8222-222222222222';

function step(id: string, requires: string[] = []) {
  return {
    id,
    title: `Step ${id}`,
    content: 'Concept explanation.',
    concepts: ['ports'],
    requires,
    challenge: {
      instructions: 'Write the module.',
      criteria: [
        { id: 'first', description: 'First check.' },
        { id: 'second', description: 'Second check.' },
      ],
    },
  };
}

function definition(steps = [step('a'), step('b', ['a']), step('c', ['b'])]) {
  return {
    title: 'Generated',
    description: 'A generated roadmap.',
    level: 'intermediate',
    steps,
    starterFiles: { 'src/index.ts': '// start\n' },
  } satisfies RoadmapDefinition;
}

describe('draft capacity and transitions', () => {
  it('counts drafts that still hold a workspace or budget', () => {
    expect(activeDraft('open')).toBe(true);
    expect(activeDraft('failed')).toBe(true);
    expect(activeDraft('generating')).toBe(true);
    expect(activeDraft('generated')).toBe(false);
    expect(activeDraft('discarded')).toBe(false);
  });

  it('limits active drafts per learner', () => {
    expect(() => assertDraftCapacity(ACTIVE_DRAFT_LIMIT - 1)).not.toThrow();

    expect(() => assertDraftCapacity(ACTIVE_DRAFT_LIMIT)).toThrow(
      expect.objectContaining({ kind: 'conflict' }),
    );
  });

  it('starts a generation only from an open or failed draft', () => {
    expect(() => assertGenerationAllowed('open')).not.toThrow();
    expect(() => assertGenerationAllowed('failed')).not.toThrow();

    expect(() => assertGenerationAllowed(null)).toThrow(
      expect.objectContaining({ kind: 'not_found' }),
    );
    expect(() => assertGenerationAllowed('discarded')).toThrow(
      expect.objectContaining({ kind: 'not_found' }),
    );
    expect(() => assertGenerationAllowed('generating')).toThrow(
      expect.objectContaining({ kind: 'conflict' }),
    );
    expect(() => assertGenerationAllowed('generated')).toThrow(
      expect.objectContaining({ kind: 'conflict' }),
    );
  });

  it('discards only drafts that never produced a roadmap and are not running', () => {
    expect(() => assertDiscardAllowed('open')).not.toThrow();
    expect(() => assertDiscardAllowed('failed')).not.toThrow();

    expect(() => assertDiscardAllowed('generating')).toThrow(
      expect.objectContaining({ kind: 'conflict' }),
    );
    expect(() => assertDiscardAllowed('generated')).toThrow(
      expect.objectContaining({ kind: 'conflict' }),
    );
    expect(() => assertDiscardAllowed('discarded')).toThrow(
      expect.objectContaining({ kind: 'not_found' }),
    );
  });
});

describe('generated roadmap rules', () => {
  it('accepts three to eight steps with two to five criteria and starter files', () => {
    expect(generatedRoadmapProblem(definition())).toBeNull();
  });

  it('rejects too few steps', () => {
    const short = definition([step('a'), step('b', ['a'])]);

    expect(generatedRoadmapProblem(short)).toBe('step_count');
  });

  it('rejects a single-criterion challenge', () => {
    const single = step('b', ['a']);
    single.challenge.criteria = [single.challenge.criteria[0]];

    const roadmap = definition([step('a'), single, step('c')]);

    expect(generatedRoadmapProblem(roadmap)).toBe('criteria_count');
  });

  it('requires concepts and prerequisites on every generated step', () => {
    const fixtureLike: RoadmapDefinition = {
      ...definition(),
      steps: definition().steps.map(({ concepts: _c, ...rest }) => rest),
    };

    expect(generatedRoadmapProblem(fixtureLike)).toBe('missing_concepts');
  });

  it('rejects an empty starter workspace', () => {
    const empty = { ...definition(), starterFiles: {} };

    expect(generatedRoadmapProblem(empty)).toBe('no_starter_files');
  });
});

describe('source evidence', () => {
  const evidence = [
    {
      stepId: 'a',
      sourceId: LIVE,
      cite: 'notes.md, lines 1-4',
      location: { lineStart: 1, lineEnd: 4 },
    },
    {
      stepId: 'b',
      sourceId: DELETED,
      cite: 'old.md, lines 2-3',
      location: { lineStart: 2, lineEnd: 3 },
    },
    {
      stepId: 'z',
      sourceId: LIVE,
      cite: 'notes.md, lines 5-9',
      location: { lineStart: 5, lineEnd: 9 },
    },
  ];

  it('keeps live sources on steps of this roadmap only', () => {
    const kept = authorizedEvidence(evidence, [LIVE], ['a', 'b', 'c']);

    expect(kept).toEqual([evidence[0]]);
  });

  it('keeps nothing when every source was deleted', () => {
    expect(authorizedEvidence(evidence, [], ['a', 'b'])).toEqual([]);
  });
});

describe('generationDecision', () => {
  const waiting = { status: 'generating' as const, executionId: 'exec-1' };
  const candidate: GeneratedRoadmap = {
    definition: definition(),
    evidence: [],
  };

  it('consolidates the awaited execution’s valid roadmap', () => {
    const decision = generationDecision(
      waiting,
      'exec-1',
      'completed',
      candidate,
    );

    expect(decision).toEqual({ action: 'consolidate', roadmap: candidate });
  });

  it('ignores results of other executions, redeliveries and settled drafts', () => {
    expect(
      generationDecision(waiting, 'exec-2', 'completed', candidate),
    ).toEqual({ action: 'ignore' });

    const generated = { status: 'generated' as const, executionId: 'exec-1' };
    expect(
      generationDecision(generated, 'exec-1', 'completed', candidate),
    ).toEqual({ action: 'ignore' });

    expect(generationDecision(null, 'exec-1', 'completed', candidate)).toEqual({
      action: 'ignore',
    });
  });

  it('fails the draft without a roadmap when the output is invalid', () => {
    const decision = generationDecision(waiting, 'exec-1', 'completed', null);

    expect(decision).toEqual({
      action: 'release',
      status: 'failed',
      reason: 'invalid_output',
    });
  });

  it('reopens a cancelled draft and fails timed-out or failed ones', () => {
    expect(generationDecision(waiting, 'exec-1', 'cancelled', null)).toEqual({
      action: 'release',
      status: 'open',
      reason: 'cancelled',
    });

    expect(generationDecision(waiting, 'exec-1', 'timed_out', null)).toEqual({
      action: 'release',
      status: 'failed',
      reason: 'timed_out',
    });
  });
});
