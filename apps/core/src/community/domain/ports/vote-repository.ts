import type { Tally, VoteValue } from '../community.js';

export interface VoteRepository {
  // Locks the publication and stores vote and counters atomically; null when not published.
  vote(
    userId: string,
    roadmapId: string,
    value: VoteValue,
  ): Promise<Tally | null>;

  votesOf(
    userId: string,
    roadmapIds: string[],
  ): Promise<Map<string, VoteValue>>;
}
