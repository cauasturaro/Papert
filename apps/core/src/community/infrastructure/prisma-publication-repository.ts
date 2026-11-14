import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/infrastructure/database/prisma.service.js';
import { CATALOG_PAGE_SIZE, pageOffset } from '../domain/catalog.js';
import { prefixQuery } from '../domain/catalog-search.js';
import type { VocabularyWord } from '../domain/catalog-search.js';
import type { CatalogQuery } from '../domain/community.js';
import type {
  NewPublication,
  PublicationRepository,
} from '../domain/ports/publication-repository.js';
import {
  PUBLICATION_SELECT,
  publication,
  publicationColumns,
} from './publication-row.js';
import type { StoredPublication } from './publication-row.js';

// Keep in sync with the order of the score index.
const RANKED = Prisma.sql`score DESC, upvotes DESC, published_at DESC, roadmap_id`;
const NEWEST = Prisma.sql`published_at DESC, roadmap_id`;

// Author names are matched as typed; a single character would match almost every author.
const MIN_AUTHOR_SEARCH = 2;

function containsPattern(text: string) {
  const escaped = text.replace(/[\\%_]/g, (character) => `\\${character}`);

  return `%${escaped}%`;
}

/** Full-text match, prefix match or author name; relevance adds both text ranks. */
function searchFilter(text: string) {
  const exact = Prisma.sql`websearch_to_tsquery('english', ${text})`;
  const prefixText = prefixQuery(text);
  const prefix = prefixText
    ? Prisma.sql`to_tsquery('english', ${prefixText})`
    : exact;

  const matches = [
    Prisma.sql`search_document @@ ${exact}`,
    Prisma.sql`search_document @@ ${prefix}`,
  ];

  if (text.length >= MIN_AUTHOR_SEARCH) {
    matches.push(Prisma.sql`author_name ILIKE ${containsPattern(text)}`);
  }

  return {
    condition: Prisma.sql`(${Prisma.join(matches, ' OR ')})`,
    relevance: Prisma.sql`ts_rank_cd(search_document, ${exact}) + ts_rank_cd(search_document, ${prefix})`,
  };
}

// Plain words of what search covers; misspelled searches are corrected against them.
function searchableText(entry: NewPublication) {
  return [
    entry.search.title,
    entry.search.topics,
    entry.search.description,
  ].join('\n');
}

export class PrismaPublicationRepository implements PublicationRepository {
  private vocabularyCache?: {
    expires: number;
    words: Promise<VocabularyWord[]>;
  };

  constructor(private readonly db: PrismaService) {}

  async find(roadmapId: string) {
    const row = await this.db.roadmapPublication.findUnique({
      where: { roadmapId },
      select: publicationColumns,
    });

    return row ? publication(row) : null;
  }

  async findMany(roadmapIds: string[]) {
    const rows = await this.db.roadmapPublication.findMany({
      where: { roadmapId: { in: roadmapIds } },
      select: publicationColumns,
    });

    return rows.map(publication);
  }

  async publish(entry: NewPublication) {
    await this.insert([entry]);

    const row = await this.db.roadmapPublication.findUniqueOrThrow({
      where: { roadmapId: entry.roadmapId },
      select: publicationColumns,
    });

    return publication(row);
  }

  async publishMany(entries: NewPublication[]) {
    if (entries.length > 0) {
      await this.insert(entries);
    }
  }

  // One statement for any number of entries; existing publications stay unchanged.
  private async insert(entries: NewPublication[]) {
    const values = entries.map(
      (entry) => Prisma.sql`(
        ${entry.roadmapId},
        ${entry.publishedByUserId}::uuid,
        ${entry.authorName},
        ${entry.level},
        ${searchableText(entry)},
        setweight(to_tsvector('english', ${entry.search.title}), 'A')
          || setweight(to_tsvector('english', ${entry.search.topics}), 'B')
          || setweight(to_tsvector('english', ${entry.search.description}), 'C')
      )`,
    );

    await this.db.$executeRaw`
      INSERT INTO core.roadmap_publication
        (roadmap_id, published_by_user_id, author_name, level, search_text, search_document)
      VALUES ${Prisma.join(values)}
      ON CONFLICT (roadmap_id) DO NOTHING
    `;

    this.vocabularyCache = undefined;
  }

  async page(query: CatalogQuery) {
    const conditions: Prisma.Sql[] = [];
    let order = query.sort === 'new' ? NEWEST : RANKED;

    if (query.level) {
      conditions.push(Prisma.sql`level = ${query.level}`);
    }

    if (query.query) {
      const search = searchFilter(query.query);

      conditions.push(search.condition);

      // Relevance first when searching; community ranking breaks ties.
      if (query.sort === 'top') {
        order = Prisma.sql`${search.relevance} DESC, ${RANKED}`;
      }
    }

    const where =
      conditions.length > 0
        ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`
        : Prisma.empty;

    const rows = await this.db.$queryRaw<StoredPublication[]>`
      SELECT ${PUBLICATION_SELECT}
      FROM core.roadmap_publication
      ${where}
      ORDER BY ${order}
      LIMIT ${CATALOG_PAGE_SIZE}
      OFFSET ${pageOffset(query.page)}
    `;

    const counted = await this.db.$queryRaw<{ total: bigint }[]>`
      SELECT count(*) AS total
      FROM core.roadmap_publication
      ${where}
    `;

    return {
      publications: rows.map(publication),
      total: Number(counted[0]?.total ?? 0),
    };
  }

  async vocabulary() {
    const now = Date.now();
    if (this.vocabularyCache && this.vocabularyCache.expires > now) {
      return this.vocabularyCache.words;
    }

    const words = this.loadVocabulary();
    const cached = { expires: now + 60_000, words };
    this.vocabularyCache = cached;

    try {
      return await words;
    } catch (error) {
      if (this.vocabularyCache === cached) {
        this.vocabularyCache = undefined;
      }

      throw error;
    }
  }

  private async loadVocabulary() {
    const rows = await this.db.$queryRaw<VocabularyWord[]>`
      SELECT word, ndoc AS documents
      FROM ts_stat('SELECT to_tsvector(''simple'', search_text) FROM core.roadmap_publication')
    `;

    return rows;
  }

  async byPublisher(userId: string) {
    const rows = await this.db.roadmapPublication.findMany({
      where: { publishedByUserId: userId },
      select: publicationColumns,
      orderBy: { publishedAt: 'desc' },
    });

    return rows.map(publication);
  }

  async top(limit: number, excludePublisher: string) {
    const rows = await this.db.$queryRaw<StoredPublication[]>`
      SELECT ${PUBLICATION_SELECT}
      FROM core.roadmap_publication
      WHERE published_by_user_id IS DISTINCT FROM ${excludePublisher}::uuid
      ORDER BY ${RANKED}
      LIMIT ${limit}
    `;

    return rows.map(publication);
  }
}
