import type { CommunityRoadmaps } from '../domain/ports/community-roadmaps.js';
import type { PublicationRepository } from '../domain/ports/publication-repository.js';
import { PAPERT_AUTHOR_NAME, searchText } from '../domain/publication.js';

/** Papert publishes its own roadmaps once per process; a failure retries on the next call. */
export class ShowcasePublisher {
  private published: Promise<void> | null = null;

  constructor(
    private readonly publications: PublicationRepository,
    private readonly roadmaps: CommunityRoadmaps,
  ) {}

  ensure() {
    this.published ??= this.publish().catch((error: unknown) => {
      this.published = null;

      throw error;
    });

    return this.published;
  }

  private async publish() {
    const roadmaps = await this.roadmaps.papert();

    const entries = roadmaps.map((roadmap) => ({
      roadmapId: roadmap.id,
      publishedByUserId: null,
      authorName: PAPERT_AUTHOR_NAME,
      level: roadmap.definition.level ?? null,
      search: searchText(roadmap.definition),
    }));

    await this.publications.publishMany(entries);
  }
}
