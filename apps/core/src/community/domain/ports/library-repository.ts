export interface LibraryRepository {
  add(userId: string, roadmapId: string): Promise<void>;
  remove(userId: string, roadmapId: string): Promise<void>;

  // Saved roadmap IDs, most recently saved first.
  list(userId: string, limit: number, cursor?: string): Promise<string[]>;
  favoritesOf(userId: string, roadmapIds: string[]): Promise<Set<string>>;
}
