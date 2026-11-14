const MAX_TERMS = 8;

// Shorter words are too ambiguous to correct: "go" is one edit away from "js".
const MIN_CORRECTED_LENGTH = 4;

// Room left for inflections such as "constraint" in "constraints".
const MAX_SUFFIX = 3;

export type SearchTerm = { word: string; excluded: boolean };

/** A word of the published text and how many roadmaps use it. */
export type VocabularyWord = { word: string; documents: number };

/** Plain words of a query; a leading minus excludes a word, as in web search. */
export function searchTerms(query: string): SearchTerm[] {
  const terms: SearchTerm[] = [];

  for (const chunk of query.toLowerCase().split(/\s+/)) {
    const excluded = chunk.startsWith('-');
    const words = chunk.match(/[\p{L}\p{N}]+/gu) ?? [];

    for (const word of words) {
      terms.push({ word, excluded });
    }
  }

  return terms.slice(0, MAX_TERMS);
}

/**
 * `to_tsquery` text that also matches words starting with each searched word, so "postgres"
 * finds "PostgreSQL". Quoted phrases stay exact, so they get no prefix query.
 */
export function prefixQuery(query: string): string | null {
  if (query.includes('"')) {
    return null;
  }

  const terms = searchTerms(query);

  if (!terms.some((term) => !term.excluded)) {
    return null;
  }

  // Words are letters and digits only, so they never form tsquery operators.
  const parts = terms.map((term) => {
    if (term.excluded) {
      return `!${term.word}`;
    }

    return term.word.length > 1 ? `${term.word}:*` : term.word;
  });

  return parts.join(' & ');
}

/** Typos allowed for a word of this length. */
function allowedEdits(length: number) {
  if (length < MIN_CORRECTED_LENGTH) {
    return 0;
  }

  return length < 6 ? 1 : 2;
}

/**
 * Fewest edits (insertion, deletion, substitution or swap of neighbours) turning `term` into
 * some beginning of `word`; a typed word is often an unfinished one.
 */
export function prefixDistance(term: string, word: string) {
  const rows: number[][] = [];

  for (let i = 0; i <= term.length; i++) {
    rows.push([i]);
  }

  for (let j = 1; j <= word.length; j++) {
    rows[0][j] = j;
  }

  for (let i = 1; i <= term.length; i++) {
    for (let j = 1; j <= word.length; j++) {
      const cost = term[i - 1] === word[j - 1] ? 0 : 1;

      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost,
      );

      const swapped =
        i > 1 &&
        j > 1 &&
        term[i - 1] === word[j - 2] &&
        term[i - 2] === word[j - 1];

      if (swapped) {
        rows[i][j] = Math.min(rows[i][j], rows[i - 2][j - 2] + 1);
      }
    }
  }

  return Math.min(...rows[term.length]);
}

/** Already searchable as typed: a beginning of a known word, or an inflection of one. */
function isKnown(term: string, vocabulary: VocabularyWord[]) {
  return vocabulary.some(({ word }) => {
    if (word.startsWith(term)) {
      return true;
    }

    return (
      word.length >= MIN_CORRECTED_LENGTH &&
      term.startsWith(word) &&
      term.length - word.length <= MAX_SUFFIX
    );
  });
}

/** The closest known word: fewest edits, then the closest length, then the most used. */
function closestWord(term: string, vocabulary: VocabularyWord[]) {
  const allowed = allowedEdits(term.length);

  if (allowed === 0 || isKnown(term, vocabulary)) {
    return null;
  }

  let best: {
    word: string;
    edits: number;
    gap: number;
    documents: number;
  } | null = null;

  for (const { word, documents } of vocabulary) {
    const edits = prefixDistance(term, word);

    if (edits > allowed) {
      continue;
    }

    const gap = Math.abs(word.length - term.length);
    const closer =
      !best ||
      edits < best.edits ||
      (edits === best.edits && gap < best.gap) ||
      (edits === best.edits && gap === best.gap && documents > best.documents);

    if (closer) {
      best = { word, edits, gap, documents };
    }
  }

  return best?.word ?? null;
}

/** The query with misspelled words replaced by the closest published words; null if none were. */
export function correctedQuery(query: string, vocabulary: VocabularyWord[]) {
  const terms = searchTerms(query);
  let corrected = false;

  const words = terms.map((term) => {
    const replacement = term.excluded
      ? null
      : closestWord(term.word, vocabulary);

    if (replacement) {
      corrected = true;

      return replacement;
    }

    return term.excluded ? `-${term.word}` : term.word;
  });

  return corrected ? words.join(' ') : null;
}
