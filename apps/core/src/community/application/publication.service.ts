import { CommunityError } from '../domain/community.js';
import type { CommunityRoadmaps } from '../domain/ports/community-roadmaps.js';
import type { PrivateReferences } from '../domain/ports/private-references.js';
import type { PublicationRepository } from '../domain/ports/publication-repository.js';
import {
  assertPublishable,
  authorNameProblem,
  publicationProblem,
  searchText,
} from '../domain/publication.js';
import {
  authorNameMessage,
  publicationProblemMessage,
  publicationView,
} from './community-presentation.js';
import {
  parse,
  publishSchema,
  roadmapIdSchema,
} from './contracts/community.contract.js';

/** A learner publishing their own generated roadmap; publication is permanent. */
export class PublicationService {
  constructor(
    private readonly publications: PublicationRepository,
    private readonly roadmaps: CommunityRoadmaps,
    private readonly references: PrivateReferences,
  ) {}

  async publish(userId: string, roadmapId: string, body: unknown) {
    parse(roadmapIdSchema, roadmapId);
    const request = parse(publishSchema, body);

    const roadmap = await this.roadmaps.find(roadmapId);
    assertPublishable(roadmap, userId);

    // Publishing again returns the first publication; its name never changes.
    const existing = await this.publications.find(roadmapId);
    if (existing) {
      return publicationView(existing);
    }

    const nameProblem = authorNameProblem(request.authorName);
    if (nameProblem) {
      throw new CommunityError('invalid', authorNameMessage(nameProblem));
    }

    const filenames = await this.references.filenames(userId, roadmapId);
    const problem = publicationProblem(roadmap.definition, filenames);
    if (problem) {
      throw new CommunityError('conflict', publicationProblemMessage(problem));
    }

    const publication = await this.publications.publish({
      roadmapId,
      publishedByUserId: userId,
      authorName: request.authorName,
      level: roadmap.definition.level ?? null,
      search: searchText(roadmap.definition),
    });

    return publicationView(publication);
  }

  async myPublications(userId: string) {
    const publications = await this.publications.byPublisher(userId);

    return publications.map(publicationView);
  }
}
