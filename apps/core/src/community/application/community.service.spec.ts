import { describe, expect, it, vi } from 'vitest';
import type {
  CommunityRoadmap,
  Publication,
  PublicDefinition,
} from '../domain/community.js';
import type { CommunityRoadmaps } from '../domain/ports/community-roadmaps.js';
import type { LibraryRepository } from '../domain/ports/library-repository.js';
import type { PublicationRepository } from '../domain/ports/publication-repository.js';
import type { VoteRepository } from '../domain/ports/vote-repository.js';
import { CommunityService } from './community.service.js';
import type { ShowcasePublisher } from './showcase-publisher.js';

const definition: PublicDefinition = {
  title: 'PostgreSQL schemas',
  description: 'Constraints and keys.',
  level: 'beginner',
  starterFiles: { 'schema.sql': '-- start' },
  steps: [],
};

function roadmap(id: string): CommunityRoadmap {
  return { id, authorUserId: 'author', definition };
}

function published(roadmapId: string): Publication {
  return {
    roadmapId,
    publishedByUserId: 'author',
    authorName: 'Ana',
    level: 'beginner',
    upvotes: 2,
    downvotes: 0,
    score: 0.34,
    publishedAt: new Date('2026-11-05T10:00:00Z'),
  };
}

function setup() {
  const publications = {
    find: vi
      .fn<PublicationRepository['find']>()
      .mockImplementation(async (id) =>
        id === 'missing' ? null : published(id),
      ),
    findMany: vi
      .fn<PublicationRepository['findMany']>()
      .mockImplementation(async (ids) =>
        ids.filter((id) => id !== 'missing').map(published),
      ),
    publish: vi.fn<PublicationRepository['publish']>(),
    publishMany: vi.fn<PublicationRepository['publishMany']>(),
    page: vi.fn<PublicationRepository['page']>(),
    vocabulary: vi.fn<PublicationRepository['vocabulary']>(),
    byPublisher: vi.fn<PublicationRepository['byPublisher']>(),
    top: vi.fn<PublicationRepository['top']>(),
  } satisfies PublicationRepository;
  const votes = {
    vote: vi
      .fn<VoteRepository['vote']>()
      .mockResolvedValue({ upvotes: 3, downvotes: 0, score: 0.43 }),
    votesOf: vi.fn<VoteRepository['votesOf']>().mockResolvedValue(new Map()),
  } satisfies VoteRepository;
  const library = {
    add: vi.fn<LibraryRepository['add']>(),
    remove: vi.fn<LibraryRepository['remove']>(),
    list: vi.fn<LibraryRepository['list']>().mockResolvedValue([]),
    favoritesOf: vi
      .fn<LibraryRepository['favoritesOf']>()
      .mockResolvedValue(new Set()),
  } satisfies LibraryRepository;
  const roadmaps = {
    find: vi
      .fn<CommunityRoadmaps['find']>()
      .mockImplementation(async (id) => roadmap(id)),
    findMany: vi
      .fn<CommunityRoadmaps['findMany']>()
      .mockImplementation(async (ids) => ids.map(roadmap)),
    papert: vi.fn<CommunityRoadmaps['papert']>(),
    startedOf: vi
      .fn<CommunityRoadmaps['startedOf']>()
      .mockResolvedValue(new Set()),
    enroll: vi
      .fn<CommunityRoadmaps['enroll']>()
      .mockResolvedValue({ workspaceId: 'workspace' }),
  } satisfies CommunityRoadmaps;
  const showcase = { ensure: vi.fn().mockResolvedValue(undefined) };
  const service = new CommunityService(
    publications,
    votes,
    library,
    roadmaps,
    showcase as unknown as ShowcasePublisher,
  );

  return { service, publications, votes, library, roadmaps, showcase };
}

describe('CommunityService', () => {
  it('returns selected cards in the requested order without unpublished ones', async () => {
    const { service } = setup();

    const cards = await service.selection('reader', 'b,missing,a,b');

    expect(cards.map((card) => card.id)).toEqual(['b', 'a']);
  });

  it('never exposes who published a roadmap', async () => {
    const { service } = setup();

    const details = await service.details('reader', 'a');

    expect(details).not.toHaveProperty('publishedByUserId');
    expect(details).not.toHaveProperty('authorUserId');
    expect(JSON.stringify(details)).not.toContain('"author"');
    expect(details.own).toBe(false);
  });

  it('refuses self-votes and votes on unpublished roadmaps before storing', async () => {
    const { service, votes, showcase } = setup();
    const body = { value: 1 };

    await expect(service.vote('author', 'a', body)).rejects.toMatchObject({
      kind: 'forbidden',
    });
    await expect(service.vote('reader', 'missing', body)).rejects.toMatchObject(
      { kind: 'not_found' },
    );

    expect(votes.vote).not.toHaveBeenCalled();
    expect(showcase.ensure).toHaveBeenCalled();
  });

  it('saves and starts only published roadmaps', async () => {
    const { service, library, roadmaps } = setup();

    await expect(
      service.favorite('reader', 'missing', {}),
    ).rejects.toMatchObject({ kind: 'not_found' });
    await expect(service.start('reader', 'missing', {})).rejects.toMatchObject({
      kind: 'not_found',
    });

    const started = await service.start('reader', 'a', {});

    expect(library.add).not.toHaveBeenCalled();
    expect(roadmaps.enroll).toHaveBeenCalledTimes(1);
    expect(started).toEqual({ roadmapId: 'a', workspaceId: 'workspace' });
  });

  it('offers Seymour candidates in ranking order', async () => {
    const { service, publications, roadmaps } = setup();
    publications.top.mockResolvedValue([published('b'), published('a')]);
    roadmaps.findMany.mockResolvedValue([roadmap('a'), roadmap('b')]);

    const candidates = await service.recommendationCandidates('reader');

    expect(candidates.map((item) => item.roadmapId)).toEqual(['b', 'a']);
    expect(candidates[0]).not.toHaveProperty('authorUserId');
  });
});
