import type * as Monaco from "monaco-editor";
import { isObject } from "./workspace-manifest.ts";
import {
  ignoredDiagnostics,
  parseManifest,
  resolvePacks,
} from "./type-packs.ts";

let manifestPromise: Promise<ReturnType<typeof parseManifest>> | undefined;
const packPromises = new Map<string, Promise<void>>();
const extraLibraries = new Map<string, Monaco.IDisposable[]>();
const loadedPacks = new Set<string>();

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error("Type pack unavailable.");
  }

  return response.json();
}

export function languageDefaults(monaco: typeof Monaco) {
  return [
    monaco.typescript.typescriptDefaults,
    monaco.typescript.javascriptDefaults,
  ];
}

function registerPackFiles(monaco: typeof Monaco, id: string, pack: unknown) {
  if (!isObject(pack) || pack.id !== id || !isObject(pack.files)) {
    return;
  }

  const defaults = languageDefaults(monaco);

  // Packs never share a URI, but a file is registered at most once per page.
  for (const [uri, content] of Object.entries(pack.files)) {
    if (typeof content !== "string") {
      continue;
    }

    if (!uri.startsWith("file:///node_modules/") || extraLibraries.has(uri)) {
      continue;
    }

    const disposables = defaults.map((entry) =>
      entry.addExtraLib(content, uri),
    );

    extraLibraries.set(uri, disposables);
  }

  loadedPacks.add(id);
}

function refreshDiagnostics(monaco: typeof Monaco) {
  const diagnosticCodesToIgnore = ignoredDiagnostics(loadedPacks);

  for (const entry of languageDefaults(monaco)) {
    entry.setDiagnosticsOptions({
      noSemanticValidation: false,
      noSyntaxValidation: false,
      diagnosticCodesToIgnore,
    });
  }
}

export async function loadTypePacks(
  monaco: typeof Monaco,
  packages: string[],
): Promise<void> {
  manifestPromise ??= fetchJson("/type-packs/manifest.json")
    .then(parseManifest)
    .catch(() => null);

  const manifest = await manifestPromise;

  if (!manifest) {
    return;
  }

  // Extra libraries resolve lazily, so packs may register in any order.
  const downloads = resolvePacks(manifest, packages).map((id) => {
    let pending = packPromises.get(id);

    if (!pending) {
      pending = fetchJson(`/type-packs/${manifest.packs[id].file}`)
        .then((pack) => registerPackFiles(monaco, id, pack))
        .catch(() => undefined);

      packPromises.set(id, pending);
    }

    return pending;
  });

  await Promise.all(downloads);

  refreshDiagnostics(monaco);
}
