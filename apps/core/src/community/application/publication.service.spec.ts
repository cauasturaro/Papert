import { describe, expect, it, vi } from 'vitest';
import type {
  CommunityRoadmap,
  Publication,
  PublicDefinition,
} from '../domain/community.js';
import type { CommunityRoadmaps } from '../domain/ports/community-roadmaps.js';
import type { PublicationRepository } from '../domain/ports/publication-repository.js';
import { PublicationService } from './publication.service.js';

const definition: PublicDefinition = {
  title: 'Hexagonal reservations',
  description: 'Ports and adapters in practice.',
  level: 'intermediate',
  starterFiles: {},
  steps: [
    {
      id: 'ports',
      title: 'Define ports',
      content: 'Write the repository port.',
      challenge: {
        instructions: 'Create the port.',
        criteria: [{ id: 'port', description: 'The port exists.' }],
      },
    },
  ],
};

const roadmap: CommunityRoadmap = {
  id: 'roadmap-1',
  authorUserId: 'author',
  definition,
};

const stored: Publication = {
  roadmapId: 'roadmap-1',
  publishedByUserId: 'author',
  authorName: 'Ana',
  level: 'intermediate',
  upvotes: 0,
  downvotes: 0,
  score: 0,
  publishedAt: new Date('2026-11-05T10:00:00Z'),
};

const request = { authorName: 'Ana', acknowledged: true };

function setup() {
  const publications = {
    find: vi.fn<PublicationRepository['find']>().mockResolvedValue(null),
    findMany: vi.fn<PublicationRepository['findMany']>(),
    publish: vi
      .fn<PublicationRepository['publish']>()
      .mockResolvedValue(stored),
    publishMany: vi.fn<PublicationRepository['publishMany']>(),
    page: vi.fn<PublicationRepository['page']>(),
    vocabulary: vi.fn<PublicationRepository['vocabulary']>(),
    byPublisher: vi.fn<PublicationRepository['byPublisher']>(),
    top: vi.fn<PublicationRepository['top']>(),
  } satisfies PublicationRepository;
  const roadmaps = {
    find: vi.fn<CommunityRoadmaps['find']>().mockResolvedValue(roadmap),
    findMany: vi.fn<CommunityRoadmaps['findMany']>(),
    papert: vi.fn<CommunityRoadmaps['papert']>(),
    startedOf: vi.fn<CommunityRoadmaps['startedOf']>(),
    enroll: vi.fn<CommunityRoadmaps['enroll']>(),
  } satisfies CommunityRoadmaps;
  const references = { filenames: vi.fn().mockResolvedValue([]) };
  const service = new PublicationService(publications, roadmaps, references);

  return { service, publications, roadmaps, references };
}

describe('PublicationService', () => {
  it('publishes the author roadmap with public facts only', async () => {
    const { service, publications } = setup();

    const view = await service.publish('author', 'roadmap-1', request);

    expect(publications.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        roadmapId: 'roadmap-1',
        publishedByUserId: 'author',
        authorName: 'Ana',
      }),
    );
    expect(view).not.toHaveProperty('publishedByUserId');
  });

  it('lets only the author publish', async () => {
    const { service, publications } = setup();

    await expect(
      service.publish('someone-else', 'roadmap-1', request),
    ).rejects.toMatchObject({ kind: 'forbidden' });

    expect(publications.publish).not.toHaveBeenCalled();
  });

  it('returns the first publication on a repeated request, ignoring a new name', async () => {
    const { service, publications } = setup();
    publications.find.mockResolvedValue(stored);

    const view = await service.publish('author', 'roadmap-1', {
      ...request,
      authorName: 'Another name',
    });

    expect(view.authorName).toBe('Ana');
    expect(publications.publish).not.toHaveBeenCalled();
  });

  it('refuses invalid names and private references before storing anything', async () => {
    const { service, publications, references } = setup();

    await expect(
      service.publish('author', 'roadmap-1', {
        ...request,
        authorName: 'Seymour fan',
      }),
    ).rejects.toMatchObject({ kind: 'invalid' });

    references.filenames.mockResolvedValue(['Write the repository port.']);
    await expect(
      service.publish('author', 'roadmap-1', request),
    ).rejects.toMatchObject({ kind: 'conflict' });

    expect(publications.publish).not.toHaveBeenCalled();
  });
});
