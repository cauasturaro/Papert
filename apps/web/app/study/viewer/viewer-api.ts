import { studyRequest } from "../study-api";
import { sourcesPath, type Source } from "../sources/sources-api";

export type Renderer = "pdf" | "markdown" | "paragraphs";

/** Short-lived links Core issues after re-checking workspace access. */
export type SourceView = {
  source: Source;
  renderer: Renderer;
  versionId: string;
  original: string;
  download: string;
  rendition: string | null;
  expiresAt: string;
};

export type RenditionBlock = {
  text: string;
  location: {
    paragraphStart: number;
    paragraphEnd: number;
    heading?: string | null;
  };
};

type Rendition = {
  version: number;
  versionId: string;
  blocks: RenditionBlock[];
};

export function fetchSourceView(workspaceId: string, sourceId: string) {
  return studyRequest<SourceView>(
    `${sourcesPath(workspaceId)}/${sourceId}/view`,
  );
}

async function fetchStored(url: string) {
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("The document could not be loaded. Try opening it again.");
  }

  return response;
}

export async function fetchMarkdownLines(view: SourceView) {
  const response = await fetchStored(view.original);
  const text = await response.text();

  return text.replace(/\r\n?/g, "\n").split("\n");
}

/** DOC/DOCX text with the paragraph numbers citations use; it must match the opened version. */
export async function fetchRenditionBlocks(view: SourceView) {
  if (!view.rendition) {
    throw new Error("This document has no text view yet.");
  }

  const response = await fetchStored(view.rendition);
  const rendition = (await response.json()) as Rendition;

  if (rendition.versionId !== view.versionId) {
    throw new Error("The text view belongs to another version of this file.");
  }

  return rendition.blocks;
}
