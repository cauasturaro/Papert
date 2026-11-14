import type { MemoryRemoval, MemoryWrite } from '../durable-memory.js';
import type { MemoryItem } from '../memory.js';

/**
 * A learner's durable items. Writes and removals lock the learner, read their unexpired items,
 * ask the domain plan what to do and apply it in the same transaction.
 */
export interface MemoryRepository {
  // Unexpired items, proposals included; expired proposals are removed first.
  list(userId: string, now: Date): Promise<MemoryItem[]>;
  write(
    userId: string,
    now: Date,
    plan: (items: MemoryItem[]) => MemoryWrite,
  ): Promise<MemoryItem>;
  remove(
    userId: string,
    now: Date,
    plan: (items: MemoryItem[]) => MemoryRemoval,
  ): Promise<void>;
  // The given ids that are active items of this learner.
  activeIds(userId: string, ids: string[]): Promise<string[]>;
}
