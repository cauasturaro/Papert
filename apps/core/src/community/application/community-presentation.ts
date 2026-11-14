import { cardConcepts } from '../domain/catalog.js';
import type {
  CommunityRoadmap,
  Publication,
  Tally,
  ViewerState,
  VoteValue,
} from '../domain/community.js';
import type {
  AuthorNameProblem,
  PublicationProblem,
} from '../domain/publication.js';

const PUBLICATION_PROBLEMS: Record<PublicationProblem, string> = {
  source_filename:
    'This roadmap names one of your private sources, so it cannot be published. Your sources stay private to your workspace.',
  storage_link:
    'This roadmap contains a storage link, so it cannot be published.',
};

const AUTHOR_NAME_PROBLEMS: Record<AuthorNameProblem, string> = {
  length: 'Use a public name with 2 to 40 characters.',
  characters:
    'Use letters, digits, spaces, dots, hyphens or underscores, starting with a letter or digit.',
  reserved: 'Choose a name that does not include Papert or Seymour.',
};

export function publicationProblemMessage(problem: PublicationProblem) {
  return PUBLICATION_PROBLEMS[problem];
}

export function authorNameMessage(problem: AuthorNameProblem) {
  return AUTHOR_NAME_PROBLEMS[problem];
}

export function tallyView(tally: Tally, myVote: VoteValue) {
  return {
    upvotes: tally.upvotes,
    downvotes: tally.downvotes,
    score: tally.score,
    myVote,
  };
}

/** Catalog card: public facts only; authorUserId and the roadmap's origin never leave Core. */
export function cardView(
  publication: Publication,
  roadmap: CommunityRoadmap,
  viewer: ViewerState,
  userId: string,
) {
  const { definition } = roadmap;
  const id = publication.roadmapId;

  return {
    id,
    title: definition.title,
    description: definition.description,
    level: publication.level,
    authorName: publication.authorName,
    publishedAt: publication.publishedAt,
    stepCount: definition.steps.length,
    concepts: cardConcepts(definition),
    ...tallyView(publication, viewer.votes.get(id) ?? 0),
    favorited: viewer.favorites.has(id),
    started: viewer.started.has(id),
    // The viewer published it; authors cannot vote on their own roadmaps.
    own: publication.publishedByUserId === userId,
  };
}

export function detailView(
  publication: Publication,
  roadmap: CommunityRoadmap,
  viewer: ViewerState,
  userId: string,
) {
  const steps = roadmap.definition.steps.map((step) => ({
    id: step.id,
    title: step.title,
    content: step.content,
    concepts: step.concepts ?? [],
    requires: step.requires ?? [],
    challenge: step.challenge,
  }));

  return {
    ...cardView(publication, roadmap, viewer, userId),
    steps,
    starterFiles: Object.keys(roadmap.definition.starterFiles).sort(),
  };
}

export function publicationView(publication: Publication) {
  return {
    roadmapId: publication.roadmapId,
    authorName: publication.authorName,
    publishedAt: publication.publishedAt,
    upvotes: publication.upvotes,
    downvotes: publication.downvotes,
  };
}
