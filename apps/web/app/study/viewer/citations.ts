// Citations Seymour attaches to answers and where they point inside a source.

export type CitationLocation =
  | { page: number }
  | { lineStart: number; lineEnd: number; headings?: string[] }
  | { paragraphStart: number; paragraphEnd: number; heading?: string | null };

export type Citation = {
  sourceId: string;
  cite: string;
  location: CitationLocation;
  excerpt: string;
  quote: string | null;
};

export type Grounding = {
  support: "cited" | "unsupported";
  citations: Citation[];
};

/** The block range a location covers; pages are the PDF viewer's unit. */
export type Target =
  | { kind: "page"; page: number }
  | { kind: "lines"; start: number; end: number }
  | { kind: "paragraphs"; start: number; end: number };

export function targetOf(location: CitationLocation): Target {
  if ("page" in location) {
    return { kind: "page", page: location.page };
  }

  if ("lineStart" in location) {
    return { kind: "lines", start: location.lineStart, end: location.lineEnd };
  }

  return {
    kind: "paragraphs",
    start: location.paragraphStart,
    end: location.paragraphEnd,
  };
}

export function covers(
  target: Target | null,
  kind: Target["kind"],
  index: number,
) {
  if (!target || target.kind !== kind || target.kind === "page") {
    return false;
  }

  return index >= target.start && index <= target.end;
}

function compact(text: string) {
  return text.replace(/\s+/g, "");
}

/**
 * Block numbers to highlight: inside the cited range, the blocks the quote copied when
 * there is one (a chunk can span a whole small file), otherwise the whole range.
 */
export function citedBlocks(
  target: Target | null,
  kind: Target["kind"],
  blocks: { number: number; text: string }[],
  quote: string,
) {
  const inRange = blocks.filter((block) => covers(target, kind, block.number));
  const quoted = compact(quote);

  const inQuote = inRange.filter((block) => {
    const text = compact(block.text);

    return quoted.length > 0 && text.length > 0 && quoted.includes(text);
  });

  const marked = inQuote.length > 0 ? inQuote : inRange;

  return new Set(marked.map((block) => block.number));
}

/** First lines of a passage, for a compact preview under the answer. */
export function preview(text: string, lines = 4) {
  const all = text.split("\n");
  const shown = all.slice(0, lines).join("\n");

  return all.length > lines ? `${shown}\n…` : shown;
}
