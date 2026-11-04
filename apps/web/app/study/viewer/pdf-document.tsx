"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { Button } from "@/components/ui/button/button";
import type { Target } from "./citations";
import type { SourceView } from "./viewer-api";
import "./pdf-text-layer.css";

// Copied to /public by scripts/prepare-pdf.mjs so it matches the installed pdfjs-dist.
const WORKER_URL = "/pdfjs/pdf.worker.min.mjs";

// Text-layer spans shorter than this match too many unrelated places on a page.
const MIN_HIGHLIGHT_CHARACTERS = 6;

function compact(text: string) {
  return text.replace(/\s+/g, "");
}

type PdfDocumentProps = {
  view: SourceView;
  target: Target | null;
  excerpt: string;
};

/** Renders one page at a time from the original PDF, opening on the cited page. */
export function PdfDocument({ view, target, excerpt }: PdfDocumentProps) {
  const citedPage = target?.kind === "page" ? target.page : 1;

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");

  // Mounted per version (see the key in SourceViewer): refreshed links do not reload it.
  const [url] = useState(view.original);

  // Opening another citation of this document jumps to its page.
  const [navigation, setNavigation] = useState({
    cited: citedPage,
    page: citedPage,
  });
  const page = navigation.cited === citedPage ? navigation.page : citedPage;

  function setPage(next: number) {
    setNavigation({ cited: citedPage, page: next });
  }

  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;

    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;

        const task = pdfjs.getDocument({ url });
        destroy = () => void task.destroy();

        const loaded = await task.promise;

        if (!disposed) {
          setPdf(loaded);
        }
      } catch {
        if (!disposed) {
          setError("The PDF could not be loaded. Try opening it again.");
        }
      }
    }

    void load();

    return () => {
      disposed = true;
      destroy?.();
    };
  }, [url]);

  if (error) {
    return <p role="alert">{error}</p>;
  }

  if (!pdf) {
    return (
      <p role="status" className="text-muted-foreground">
        Loading the PDF…
      </p>
    );
  }

  const pageCount = pdf.numPages;
  const current = Math.min(Math.max(page, 1), pageCount);
  const onCitedPage = target?.kind === "page" && current === citedPage;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <nav
        aria-label="PDF pages"
        className="flex shrink-0 flex-wrap items-center gap-2"
      >
        <Button
          size="sm"
          variant="outline"
          disabled={current <= 1}
          onClick={() => setPage(current - 1)}
        >
          Previous
        </Button>

        <p role="status" className="text-sm">
          Page {current} of {pageCount}
        </p>

        <Button
          size="sm"
          variant="outline"
          disabled={current >= pageCount}
          onClick={() => setPage(current + 1)}
        >
          Next
        </Button>

        {target?.kind === "page" && !onCitedPage && (
          <Button size="sm" variant="ghost" onClick={() => setPage(citedPage)}>
            Back to cited page {citedPage}
          </Button>
        )}
      </nav>

      <PdfPage
        pdf={pdf}
        page={current}
        highlight={onCitedPage ? excerpt : ""}
      />
    </div>
  );
}

type PdfPageProps = {
  pdf: PDFDocumentProxy;
  page: number;
  highlight: string;
};

function PdfPage({ pdf, page, highlight }: PdfPageProps) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = frame.current;

    if (!element) {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.floor(entry.contentRect.width));
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const surface = canvas.current;
    const layer = textLayer.current;

    if (!surface || !layer || width === 0) {
      return;
    }

    let cancelled = false;
    let cancelRender: (() => void) | undefined;

    async function draw(surface: HTMLCanvasElement, layer: HTMLDivElement) {
      const pdfjs = await import("pdfjs-dist");
      const pdfPage = await pdf.getPage(page);

      if (cancelled) {
        return;
      }

      const natural = pdfPage.getViewport({ scale: 1 });
      const viewport = pdfPage.getViewport({ scale: width / natural.width });
      const ratio = window.devicePixelRatio || 1;

      surface.width = Math.floor(viewport.width * ratio);
      surface.height = Math.floor(viewport.height * ratio);
      surface.style.width = `${viewport.width}px`;
      surface.style.height = `${viewport.height}px`;

      const render = pdfPage.render({
        canvas: surface,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      cancelRender = () => render.cancel();

      // The text layer makes the page selectable and lets the cited text be marked.
      layer.replaceChildren();
      layer.style.setProperty("--total-scale-factor", String(viewport.scale));

      const text = new pdfjs.TextLayer({
        textContentSource: pdfPage.streamTextContent(),
        container: layer,
        viewport,
      });

      await Promise.all([render.promise, text.render()]);

      if (!cancelled) {
        markCitedText(layer, highlight);
      }
    }

    draw(surface, layer).catch(() => {
      // A cancelled render rejects; the next effect run draws the current page.
    });

    return () => {
      cancelled = true;
      cancelRender?.();
    };
  }, [pdf, page, width, highlight]);

  return (
    <div ref={frame} className="min-h-0 w-full flex-1 overflow-auto">
      <div className="relative mx-auto w-fit bg-white shadow-sm">
        <canvas ref={canvas} aria-label={`Page ${page} of the PDF`} />
        <div ref={textLayer} className="textLayer" />
      </div>
    </div>
  );
}

function markCitedText(layer: HTMLDivElement, highlight: string) {
  const passage = compact(highlight);

  if (!passage) {
    return;
  }

  for (const span of layer.querySelectorAll("span")) {
    const text = compact(span.textContent ?? "");

    if (text.length >= MIN_HIGHLIGHT_CHARACTERS && passage.includes(text)) {
      span.classList.add("papert-cited");
    }
  }
}
