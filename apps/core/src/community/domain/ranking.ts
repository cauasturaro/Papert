import { CommunityError } from './community.js';
import type { Publication, Tally, VoteValue } from './community.js';

// 95 % confidence.
const Z = 1.96;

/**
 * Wilson score lower bound of the share of upvotes. A roadmap with few votes ranks below one
 * with many votes at the same share, so a single early upvote cannot top the catalog.
 */
export function wilsonScore(upvotes: number, downvotes: number) {
  const total = upvotes + downvotes;

  if (total === 0) {
    return 0;
  }

  const share = upvotes / total;
  const z2 = Z * Z;

  const centre = share + z2 / (2 * total);
  const margin =
    Z * Math.sqrt((share * (1 - share) + z2 / (4 * total)) / total);
  const bound = (centre - margin) / (1 + z2 / total);

  return Math.min(1, Math.max(0, bound));
}

/** New counters after a learner's vote moves from `previous` to `next`. */
export function voteChange(
  tally: Pick<Tally, 'upvotes' | 'downvotes'>,
  previous: VoteValue,
  next: VoteValue,
): Tally {
  let upvotes = tally.upvotes;
  let downvotes = tally.downvotes;

  if (previous === 1) {
    upvotes--;
  }

  if (previous === -1) {
    downvotes--;
  }

  if (next === 1) {
    upvotes++;
  }

  if (next === -1) {
    downvotes++;
  }

  return { upvotes, downvotes, score: wilsonScore(upvotes, downvotes) };
}

/** Self-votes would let any author lift their own roadmap. */
export function assertVoteAllowed(publication: Publication, userId: string) {
  if (publication.publishedByUserId === userId) {
    throw new CommunityError(
      'forbidden',
      'You cannot vote on a roadmap you published.',
    );
  }
}

export function toVote(value: number | null | undefined): VoteValue {
  if (value === 1 || value === -1) {
    return value;
  }

  return 0;
}
