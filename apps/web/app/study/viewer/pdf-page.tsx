"use client";

import type { PDFDocumentProxy } from "pdfjs-dist";
import { usePdfPage } from "./use-pdf-page";

type PdfPageProps = {
  pdf: PDFDocumentProxy;
  page: number;
  highlight: string;
};

export function PdfPage({ pdf, page, highlight }: PdfPageProps) {
  const { frame, canvas, textLayer, error } = usePdfPage(pdf, page, highlight);

  return (
    <div ref={frame} className="min-h-0 w-full flex-1 overflow-auto">
      {error && <p role="alert">{error}</p>}
      <div className="relative mx-auto w-fit bg-white shadow-sm">
        <canvas ref={canvas} aria-label={`Page ${page} of the PDF`} />
        <div ref={textLayer} className="textLayer" />
      </div>
    </div>
  );
}
