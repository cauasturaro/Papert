"use client";

import { useEffect, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";

const WORKER_URL = "/pdfjs/pdf.worker.min.mjs";

export function usePdfDocument(url: string) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let disposed = false;
    let destroy: (() => void) | undefined;

    async function load() {
      try {
        const pdfjs = await import("pdfjs-dist");

        if (disposed) {
          return;
        }

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

  return { pdf, error };
}
