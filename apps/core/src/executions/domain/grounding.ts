// How a tutor answer is supported by the learner's sources (ADR-007).

export type CitationLocation =
  | { page: number }
  | { lineStart: number; lineEnd: number; headings?: string[] }
  | {
      paragraphStart: number;
      paragraphEnd: number;
      heading?: string | null;
    };

export type Citation = {
  sourceId: string;
  cite: string;
  location: CitationLocation;
  excerpt: string;
  quote: string | null;
};

export type Grounding = {
  support: 'cited' | 'unsupported';
  citations: Citation[];
};

/** Sources the execution was admitted with that are still ready now. */
export function liveSourceIds(admitted: string[], ready: string[]) {
  const current = new Set(ready);

  return admitted.filter((id) => current.has(id));
}

/**
 * Keeps citations of live sources only. A source deleted while the answer was produced
 * loses its citation and quote; without any citation left the answer is unsupported.
 */
export function authorizedGrounding(
  grounding: Grounding,
  live: string[],
): Grounding {
  const allowed = new Set(live);
  const citations = grounding.citations.filter((citation) =>
    allowed.has(citation.sourceId),
  );

  const support = citations.length > 0 ? 'cited' : 'unsupported';

  return { support, citations };
}

/** Source ids snapshotted into a tutor execution's input at admission. */
export function admittedSourceIds(input: unknown) {
  const snapshot = input as { sources?: { id?: unknown }[] };

  if (!Array.isArray(snapshot.sources)) {
    return [];
  }

  return snapshot.sources
    .map((source) => source.id)
    .filter((id): id is string => typeof id === 'string');
}
