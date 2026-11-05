import { describe, expect, it } from 'vitest';
import type { CommunityRoadmap, PublicDefinition } from './community.js';
import {
  assertPublishable,
  authorNameProblem,
  publicationProblem,
  searchText,
} from './publication.js';

function definition(content = 'Define ports for the reservation service.') {
  const roadmap: PublicDefinition = {
    title: 'Hexagonal reservations',
    description: 'Ports and adapters in practice.',
    level: 'intermediate',
    starterFiles: { 'src/domain/README.md': '# Domain\n' },
    steps: [
      {
        id: 'ports',
        title: 'Define ports',
        content,
        concepts: ['Ports', 'Adapters'],
        requires: [],
        challenge: {
          instructions: 'Write the repository port.',
          criteria: [{ id: 'port', description: 'The port file exists.' }],
        },
      },
    ],
  };

  return roadmap;
}

describe('assertPublishable', () => {
  const roadmap: CommunityRoadmap = {
    id: 'roadmap-1',
    authorUserId: 'author',
    definition: definition(),
  };

  it('lets only the author publish a generated roadmap', () => {
    expect(() => assertPublishable(roadmap, 'author')).not.toThrow();

    expect(() => assertPublishable(roadmap, 'other')).toThrow(
      expect.objectContaining({ kind: 'forbidden' }),
    );
    expect(() =>
      assertPublishable({ ...roadmap, authorUserId: null }, 'author'),
    ).toThrow(expect.objectContaining({ kind: 'forbidden' }));
    expect(() => assertPublishable(null, 'author')).toThrow(
      expect.objectContaining({ kind: 'not_found' }),
    );
  });
});

describe('authorNameProblem', () => {
  it('accepts plain public names', () => {
    expect(authorNameProblem('Ana Souza')).toBeNull();
    expect(authorNameProblem('dev_42')).toBeNull();
    expect(authorNameProblem('José-Luis')).toBeNull();
  });

  it('rejects lengths, symbols and reserved names', () => {
    expect(authorNameProblem('A')).toBe('length');
    expect(authorNameProblem('x'.repeat(41))).toBe('length');
    expect(authorNameProblem('<script>')).toBe('characters');
    expect(authorNameProblem(' leading')).toBe('characters');
    expect(authorNameProblem('Papert Team')).toBe('reserved');
    expect(authorNameProblem('the.seymour')).toBe('reserved');
  });
});

describe('publicationProblem', () => {
  it('passes text without private references', () => {
    const problem = publicationProblem(definition(), ['team-notes.md']);

    expect(problem).toBeNull();
  });

  it('refuses text naming a private source, in any case', () => {
    const leaking = definition('Follow the folders in Team-Notes.MD.');

    const problem = publicationProblem(leaking, ['team-notes.md']);

    expect(problem).toBe('source_filename');
  });

  it('refuses storage links, signatures and object keys', () => {
    const presigned = definition(
      'See https://papert-sources.s3.amazonaws.com/x?X-Amz-Signature=abc',
    );
    const key = definition(
      'Read documents/2bdb1eb1-07d0-4d3d-9408-8fba21a2d555/original.pdf',
    );

    expect(publicationProblem(presigned, [])).toBe('storage_link');
    expect(publicationProblem(key, [])).toBe('storage_link');
  });

  it('also checks starter files', () => {
    const roadmap = definition();
    roadmap.starterFiles['notes.md'] = 'Based on team-notes.md';

    const problem = publicationProblem(roadmap, ['team-notes.md']);

    expect(problem).toBe('source_filename');
  });

  it('also checks step, prerequisite and criterion identifiers', () => {
    const stepId = definition();
    stepId.steps[0].id = 'team-notes.md';

    const requires = definition();
    requires.steps[0].requires = [
      'documents/0b6d2f4e-3c1a-4f7e-9a8b-1c2d3e4f5a6b/',
    ];

    const criterion = definition();
    criterion.steps[0].challenge.criteria[0].id = 'from-team-notes.md';

    expect(publicationProblem(stepId, ['team-notes.md'])).toBe(
      'source_filename',
    );
    expect(publicationProblem(requires, [])).toBe('storage_link');
    expect(publicationProblem(criterion, ['team-notes.md'])).toBe(
      'source_filename',
    );
  });
});

describe('searchText', () => {
  it('weights title, then concepts and steps, then description', () => {
    const text = searchText(definition());

    expect(text).toEqual({
      title: 'Hexagonal reservations',
      topics: 'Ports Adapters Define ports',
      description: 'Ports and adapters in practice.',
    });
  });
});
