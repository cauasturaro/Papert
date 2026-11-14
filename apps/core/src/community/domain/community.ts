import { DomainError } from '../../common/domain/domain-error.js';

export class CommunityError extends DomainError {}

export type CatalogLevel = 'beginner' | 'intermediate' | 'advanced';

export type CatalogSort = 'top' | 'new';

/** A learner's vote; 0 removes it. */
export type VoteValue = -1 | 0 | 1;

/** Public facts of a step; everything else about the roadmap's origin stays private. */
export type PublicStep = {
  id: string;
  title: string;
  content: string;
  concepts?: string[];
  requires?: string[];
  challenge: {
    instructions: string;
    criteria: { id: string; description: string }[];
  };
};

export type PublicDefinition = {
  title: string;
  description: string;
  level?: CatalogLevel;
  steps: PublicStep[];
  starterFiles: Record<string, string>;
};

/** A roadmap as Community reads it from Study. */
export type CommunityRoadmap = {
  id: string;
  authorUserId: string | null;
  definition: PublicDefinition;
};

export type Publication = {
  roadmapId: string;
  publishedByUserId: string | null;
  authorName: string;
  level: CatalogLevel | null;
  upvotes: number;
  downvotes: number;
  score: number;
  publishedAt: Date;
};

export type Tally = {
  upvotes: number;
  downvotes: number;
  score: number;
};

export type CatalogQuery = {
  query: string | null;
  level: CatalogLevel | null;
  sort: CatalogSort;
  page: number;
};

export type CatalogPage = {
  publications: Publication[];
  total: number;
};

/** The viewer's own relation to a set of roadmaps. */
export type ViewerState = {
  votes: Map<string, VoteValue>;
  favorites: Set<string>;
  started: Set<string>;
};
