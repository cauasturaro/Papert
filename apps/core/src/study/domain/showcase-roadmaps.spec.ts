import { describe, expect, it } from 'vitest';
import { roadmapSchema } from '../application/contracts/study.contract.js';
import { generatedRoadmapProblem } from './roadmap-draft.js';
import { SHOWCASE_ROADMAPS } from './showcase-roadmaps.js';

const EXPECTED = [
  ['hexagonal-architecture-nestjs', 'intermediate'],
  ['rag-fastapi-pgvector', 'advanced'],
  ['docker-ci-cd-production', 'intermediate'],
  ['postgresql-schema-design', 'beginner'],
  ['typescript-rest-api-express', 'beginner'],
  ['python-testing-pytest', 'beginner'],
  ['react-data-fetching-tanstack-query', 'intermediate'],
  ['event-driven-aws-sqs-lambda', 'advanced'],
];

describe('showcase roadmaps', () => {
  it('keeps the eight unique catalog identities in order with their levels', () => {
    const identities = SHOWCASE_ROADMAPS.map(({ id, definition }) => [
      id,
      definition.level,
    ]);
    const ids = SHOWCASE_ROADMAPS.map(({ id }) => id);
    const titles = SHOWCASE_ROADMAPS.map(({ definition }) => definition.title);

    expect(identities).toEqual(EXPECTED);
    expect(new Set(ids).size).toBe(8);
    expect(new Set(titles).size).toBe(8);

    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9-]{1,100}$/);
      expect(id).not.toBe('http-service-foundations');
    }
  });

  it.each(SHOWCASE_ROADMAPS)(
    '$id satisfies roadmap and generation contracts',
    ({ definition }) => {
      const parsed = roadmapSchema.parse(definition);
      const problem = generatedRoadmapProblem(definition);

      expect(parsed).toEqual(definition);
      expect(problem).toBeNull();
      expect(definition.steps.length).toBeGreaterThanOrEqual(4);
      expect(definition.steps.length).toBeLessThanOrEqual(6);
    },
  );

  it.each(SHOWCASE_ROADMAPS)(
    '$id keeps lessons and starters within the content budget',
    ({ definition }) => {
      const files = Object.entries(definition.starterFiles);
      const serializedSize = new TextEncoder().encode(
        JSON.stringify(definition.starterFiles),
      ).length;

      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files.length).toBeLessThanOrEqual(6);
      expect(serializedSize).toBeLessThan(16000);

      for (const [path, content] of files) {
        expect(path).toMatch(/^[a-zA-Z0-9_.\-/]+$/);
        expect(content.length).toBeLessThan(4000);
      }

      for (const step of definition.steps) {
        const words = step.content.split(/\s+/).length;

        expect(words).toBeGreaterThanOrEqual(80);
        expect(words).toBeLessThanOrEqual(180);

        for (const criterion of step.challenge.criteria) {
          expect(criterion.id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        }
      }
    },
  );
});
