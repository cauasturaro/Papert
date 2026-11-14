/** Names that identify the author's private sources for a roadmap they generated. */
export interface PrivateReferences {
  filenames(userId: string, roadmapId: string): Promise<string[]>;
}
