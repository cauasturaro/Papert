import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The worker must come from the same pdfjs-dist version as the bundled API.
const worker = fileURLToPath(
  import.meta.resolve("pdfjs-dist/build/pdf.worker.min.mjs"),
);

rmSync("public/pdfjs", { recursive: true, force: true });
mkdirSync("public/pdfjs", { recursive: true });

copyFileSync(worker, "public/pdfjs/pdf.worker.min.mjs");
