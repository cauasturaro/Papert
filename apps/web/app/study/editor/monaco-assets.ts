/** Content-hashed Monaco files, by the role the editor knows them by. */
export type MonacoAssets = {
  editor: string;
  workers: { editor: string; ts: string; json: string };
};

const MANIFEST_URL = "/monaco/manifest.json";

// Names written by scripts/prepare-monaco.mjs, such as "ts.worker-0fa5dae1f3086c5b.js".
const ASSET_NAME = /^[a-z.]+-[0-9a-f]{16}\.js$/;

function assetName(value: unknown) {
  return typeof value === "string" && ASSET_NAME.test(value) ? value : null;
}

/** The manifest's file names, or null when it is not one prepare-monaco wrote. */
export function parseMonacoAssets(value: unknown): MonacoAssets | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const manifest = value as { editor?: unknown; workers?: unknown };
  const workers = (manifest.workers ?? {}) as Record<string, unknown>;

  const editor = assetName(manifest.editor);
  const editorWorker = assetName(workers.editor);
  const tsWorker = assetName(workers.ts);
  const jsonWorker = assetName(workers.json);

  if (!editor || !editorWorker || !tsWorker || !jsonWorker) {
    return null;
  }

  return {
    editor,
    workers: { editor: editorWorker, ts: tsWorker, json: jsonWorker },
  };
}

/** The worker file for a Monaco language label. */
export function workerFile(assets: MonacoAssets, label: string) {
  if (label === "typescript" || label === "javascript") {
    return assets.workers.ts;
  }

  if (label === "json") {
    return assets.workers.json;
  }

  return assets.workers.editor;
}

export async function loadMonacoAssets() {
  // Revalidated on every load; the hashed files it names are cached for good.
  const response = await fetch(MANIFEST_URL, { cache: "no-cache" });

  if (!response.ok) {
    throw new Error("Unable to load editor.");
  }

  const assets = parseMonacoAssets(await response.json());

  if (!assets) {
    throw new Error("Unable to load editor.");
  }

  return assets;
}
