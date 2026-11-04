import { describe, expect, it } from 'vitest';
import { parseGeneratedRoadmap } from './generation.contract.js';

const SOURCE = '11111111-1111-4111-8111-111111111111';

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

function candidate() {
  return {
    definition: {
      title: 'Generated',
      description: 'A generated roadmap.',
      level: 'beginner',
      steps: [step('a'), step('b', ['a']), step('c', ['a', 'b'])],
      starterFiles: { 'src/index.ts': '// start\n' } as Record<string, string>,
    },
    evidence: [
      {
        stepId: 'b',
        sourceId: SOURCE,
        cite: 'notes.md, lines 3-8',
        location: { lineStart: 3, lineEnd: 8, headings: ['Ports'] },
      },
    ],
  };
}

describe('parseGeneratedRoadmap', () => {
  it('accepts a valid candidate with evidence', () => {
    const parsed = parseGeneratedRoadmap(candidate());

    expect(parsed?.definition.steps).toHaveLength(3);
    expect(parsed?.evidence[0].sourceId).toBe(SOURCE);
  });

  it('rejects a step that requires a later step', () => {
    const forward = candidate();
    forward.definition.steps[0].requires = ['c'];

    expect(parseGeneratedRoadmap(forward)).toBeNull();
  });

  it('rejects unknown fields, invalid files and malformed evidence', () => {
    const extra = { ...candidate(), approved: true };
    expect(parseGeneratedRoadmap(extra)).toBeNull();

    const traversal = candidate();
    traversal.definition.starterFiles = { '../etc/passwd': 'x' };
    expect(parseGeneratedRoadmap(traversal)).toBeNull();

    const badEvidence = candidate();
    badEvidence.evidence[0].sourceId = 'not-a-uuid';
    expect(parseGeneratedRoadmap(badEvidence)).toBeNull();
  });

  it('rejects valid JSON that breaks the generated-roadmap rules', () => {
    const short = candidate();
    short.definition.steps = short.definition.steps.slice(0, 2);

    expect(parseGeneratedRoadmap(short)).toBeNull();
  });

  it('rejects missing or non-object output', () => {
    expect(parseGeneratedRoadmap(undefined)).toBeNull();
    expect(parseGeneratedRoadmap('{"definition":{}}')).toBeNull();
  });
});
