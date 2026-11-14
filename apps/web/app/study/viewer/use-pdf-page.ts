"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { isPdfCancellation } from "./pdf-errors";

const MIN_HIGHLIGHT_CHARACTERS = 6;

function compact(text: string) {
  return text.replace(/\s+/g, "");
}

export function usePdfPage(pdf: PDFDocumentProxy, page: number, highlight: string) {
  const frame = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const textLayer = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
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

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const surface = canvas.current;
    const layer = textLayer.current;

    if (!surface || !layer || width === 0) {
      return;
    }

    let cancelled = false;
    let cancelRender: (() => void) | undefined;
    let cancelText: (() => void) | undefined;

    async function draw(surface: HTMLCanvasElement, layer: HTMLDivElement) {
      const pdfjs = await import("pdfjs-dist");

      if (cancelled) {
        return;
      }

      setError("");

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

      cancelText = () => text.cancel();

      await Promise.all([render.promise, text.render()]);

      if (!cancelled) {
        markCitedText(layer, highlight);
      }
    }

    draw(surface, layer).catch((failure: unknown) => {
      if (cancelled || isPdfCancellation(failure)) {
        return;
      }

      cancelRender?.();
      cancelText?.();
      setError("The PDF page could not be rendered. Try opening it again.");
    });

    return () => {
      cancelled = true;
      cancelRender?.();
      cancelText?.();
    };
  }, [pdf, page, width, highlight]);

  return { frame, canvas, textLayer, error };
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
