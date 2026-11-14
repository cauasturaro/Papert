/** Where a cited chunk sits in its source: a PDF page, MD lines or DOC/DOCX paragraphs. */
export type CitationLocation =
  | { page: number }
  | { lineStart: number; lineEnd: number; headings?: string[] }
  | {
      paragraphStart: number;
      paragraphEnd: number;
      heading?: string | null;
    };
