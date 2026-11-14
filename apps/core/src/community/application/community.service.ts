import { cursorPageSchema } from '../../common/application/contracts/cursor-page.contract.js';
import {
  assertPublished,
  CATALOG_PAGE_SIZE,
  LIBRARY_LIMIT,
  pageOffset,
  RECOMMENDATION_CANDIDATES,
  recommendationCandidate,
} from '../domain/catalog.js';
import { correctedQuery } from '../domain/catalog-search.js';
import { CommunityError } from '../domain/community.js';
import type {
  CatalogQuery,
  CommunityRoadmap,
  Publication,
  ViewerState,
} from '../domain/community.js';
import { assertVoteAllowed } from '../domain/ranking.js';
import type { CommunityRoadmaps } from '../domain/ports/community-roadmaps.js';
import type { LibraryRepository } from '../domain/ports/library-repository.js';
import type { PublicationRepository } from '../domain/ports/publication-repository.js';
import type { VoteRepository } from '../domain/ports/vote-repository.js';
import { cardView, detailView, tallyView } from './community-presentation.js';
import {
  catalogQuerySchema,
  emptyBodySchema,
  idsSchema,
  parse,
  roadmapIdSchema,
  voteSchema,
} from './contracts/community.contract.js';
import type { ShowcasePublisher } from './showcase-publisher.js';

/** Catalog, votes and the personal library; Study keeps roadmaps and workspaces. */
export class CommunityService {
  constructor(
    private readonly publications: PublicationRepository,
    private readonly votes: VoteRepository,
    private readonly library: LibraryRepository,
    private readonly roadmaps: CommunityRoadmaps,
    private readonly showcase: ShowcasePublisher,
  ) {}

  async catalog(userId: string, rawQuery: unknown) {
    const query = parse(catalogQuerySchema, rawQuery);

    await this.showcase.ensure();

    const { page, correction } = await this.searchPage(query);
    const items = await this.cards(userId, page.publications);

    return {
      items,
      page: query.page,
      pageSize: CATALOG_PAGE_SIZE,
      total: page.total,
      hasMore: pageOffset(query.page) + items.length < page.total,
      correctedQuery: correction,
    };
  }

  /** A search without results is retried once with misspelled words corrected. */
  private async searchPage(query: CatalogQuery) {
    const page = await this.publications.page(query);

    if (page.total > 0 || !query.query) {
      return { page, correction: null };
    }

    const vocabulary = await this.publications.vocabulary();
    const correction = correctedQuery(query.query, vocabulary);

    if (!correction) {
      return { page, correction: null };
    }

    const corrected = await this.publications.page({
      ...query,
      query: correction,
    });

    // A correction that finds nothing either would only confuse the empty state.
    if (corrected.total === 0) {
      return { page, correction: null };
    }

    return { page: corrected, correction };
  }

  /** Cards for the given IDs in the given order; unpublished IDs are left out. */
  async selection(userId: string, rawIds: unknown) {
    const ids = parse(idsSchema, rawIds);

    await this.showcase.ensure();

    const ordered = await this.publishedInOrder(ids);

    return this.cards(userId, ordered);
  }

  async details(userId: string, roadmapId: string) {
    parse(roadmapIdSchema, roadmapId);

    await this.showcase.ensure();

    const publication = assertPublished(
      await this.publications.find(roadmapId),
    );
    const roadmap = assertPublished(await this.roadmaps.find(roadmapId));
    const viewer = await this.viewer(userId, [roadmapId]);

    return detailView(publication, roadmap, viewer, userId);
  }

  async vote(userId: string, roadmapId: string, body: unknown) {
    parse(roadmapIdSchema, roadmapId);
    const { value } = parse(voteSchema, body);

    await this.showcase.ensure();

    const publication = assertPublished(
      await this.publications.find(roadmapId),
    );
    assertVoteAllowed(publication, userId);

    const tally = await this.votes.vote(userId, roadmapId, value);
    if (!tally) {
      throw new CommunityError('not_found', 'Community roadmap not found.');
    }

    return tallyView(tally, value);
  }

  async favorite(userId: string, roadmapId: string, body: unknown) {
    parse(roadmapIdSchema, roadmapId);
    parse(emptyBodySchema, body);

    await this.showcase.ensure();

    assertPublished(await this.publications.find(roadmapId));

    await this.library.add(userId, roadmapId);

    return { roadmapId, favorited: true };
  }

  async unfavorite(userId: string, roadmapId: string, body: unknown) {
    parse(roadmapIdSchema, roadmapId);
    parse(emptyBodySchema, body);

    await this.library.remove(userId, roadmapId);

    return { roadmapId, favorited: false };
  }

  async savedRoadmapPage(userId: string, query: unknown) {
    const page = parse(
      cursorPageSchema.extend({ cursor: roadmapIdSchema.optional() }),
      query,
    );
    const rows = await this.library.list(userId, page.limit + 1, page.cursor);
    const ids = rows.slice(0, page.limit);
    const ordered = await this.publishedInOrder(ids);
    const items = await this.cards(userId, ordered);

    return {
      items,
      nextCursor: rows.length > page.limit ? ids[ids.length - 1] : null,
    };
  }

  async savedRoadmaps(userId: string) {
    const ids = await this.library.list(userId, LIBRARY_LIMIT);

    const ordered = await this.publishedInOrder(ids);

    return this.cards(userId, ordered);
  }

  /** Provisions the learner's own workspace; the roadmap and its author never change. */
  async start(userId: string, roadmapId: string, body: unknown) {
    parse(roadmapIdSchema, roadmapId);
    parse(emptyBodySchema, body);

    await this.showcase.ensure();

    assertPublished(await this.publications.find(roadmapId));

    const { workspaceId } = await this.roadmaps.enroll(userId, roadmapId);

    return { roadmapId, workspaceId };
  }

  /** Public text of the best-ranked roadmaps a learner did not publish, for Seymour. */
  async recommendationCandidates(userId: string) {
    await this.showcase.ensure();

    const top = await this.publications.top(RECOMMENDATION_CANDIDATES, userId);
    const ids = top.map((item) => item.roadmapId);

    const roadmaps = await this.roadmaps.findMany(ids);
    const byId = new Map(roadmaps.map((roadmap) => [roadmap.id, roadmap]));

    // Keep the ranking order; Seymour ranks by similarity but the cap must cut the lowest.
    return ids.flatMap((id) => {
      const roadmap = byId.get(id);

      return roadmap ? [recommendationCandidate(roadmap)] : [];
    });
  }

  async publishedIds(roadmapIds: string[]) {
    if (roadmapIds.length === 0) {
      return [];
    }

    const found = await this.publications.findMany(roadmapIds);

    return found.map((item) => item.roadmapId);
  }

  private async publishedInOrder(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }

    const found = await this.publications.findMany(ids);
    const byId = new Map(found.map((item) => [item.roadmapId, item]));

    return ids.flatMap((id) => byId.get(id) ?? []);
  }

  private async cards(userId: string, publications: Publication[]) {
    const ids = publications.map((item) => item.roadmapId);

    const roadmaps = await this.roadmaps.findMany(ids);
    const byId = new Map<string, CommunityRoadmap>(
      roadmaps.map((item) => [item.id, item]),
    );
    const viewer = await this.viewer(userId, ids);

    return publications.flatMap((publication) => {
      const roadmap = byId.get(publication.roadmapId);

      return roadmap ? [cardView(publication, roadmap, viewer, userId)] : [];
    });
  }

  private async viewer(userId: string, ids: string[]): Promise<ViewerState> {
    if (ids.length === 0) {
      return { votes: new Map(), favorites: new Set(), started: new Set() };
    }

    const [votes, favorites, started] = await Promise.all([
      this.votes.votesOf(userId, ids),
      this.library.favoritesOf(userId, ids),
      this.roadmaps.startedOf(userId, ids),
    ]);

    return { votes, favorites, started };
  }
}
