/** Durable notes that are still active; provided by the memory module. */
export interface TutorNoteCatalog {
  active(userId: string, ids: string[]): Promise<string[]>;
}
