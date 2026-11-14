import { Prisma } from '@prisma/client';
import type { CatalogLevel, Publication } from '../domain/community.js';

// Every column except the search vector, which Prisma cannot read.
export const publicationColumns = {
  roadmapId: true,
  publishedByUserId: true,
  authorName: true,
  level: true,
  upvotes: true,
  downvotes: true,
  score: true,
  publishedAt: true,
} as const;

// The same columns for raw queries.
export const PUBLICATION_SELECT = Prisma.sql`
  roadmap_id AS "roadmapId",
  published_by_user_id AS "publishedByUserId",
  author_name AS "authorName",
  level,
  upvotes,
  downvotes,
  score,
  published_at AS "publishedAt"`;

export type StoredPublication = {
  roadmapId: string;
  publishedByUserId: string | null;
  authorName: string;
  level: string | null;
  upvotes: number;
  downvotes: number;
  score: number;
  publishedAt: Date;
};

// The level column is limited to catalog levels by a check constraint.
export function publication(row: StoredPublication): Publication {
  return { ...row, level: row.level as CatalogLevel | null };
}
