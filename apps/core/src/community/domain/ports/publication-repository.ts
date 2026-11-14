import type {
  CatalogLevel,
  CatalogPage,
  CatalogQuery,
  Publication,
} from '../community.js';
import type { VocabularyWord } from '../catalog-search.js';

export type NewPublication = {
  roadmapId: string;
  // Null when Papert publishes its own roadmaps.
  publishedByUserId: string | null;
  authorName: string;
  level: CatalogLevel | null;
  search: { title: string; topics: string; description: string };
};

export interface PublicationRepository {
  find(roadmapId: string): Promise<Publication | null>;
  findMany(roadmapIds: string[]): Promise<Publication[]>;

  // Inserts once; a repeated request returns the existing publication unchanged.
  publish(entry: NewPublication): Promise<Publication>;
  publishMany(entries: NewPublication[]): Promise<void>;

  page(query: CatalogQuery): Promise<CatalogPage>;
  // Every word published roadmaps can be found by, for correcting misspelled searches.
  vocabulary(): Promise<VocabularyWord[]>;
  byPublisher(userId: string): Promise<Publication[]>;
  // Highest ranked first, leaving out what the given user published.
  top(limit: number, excludePublisher: string): Promise<Publication[]>;
}
