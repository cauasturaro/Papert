import { dependencyNames, isObject } from "./workspace-manifest.ts";

type PackManifest = {
  version: 1;
  packs: Record<
    string,
    { file: string; triggers: string[]; requires: string[] }
  >;
};

const BUILTINS = new Set(
  "assert async_hooks buffer child_process cluster console constants crypto dgram diagnostics_channel dns domain events fs http http2 https inspector module net os path perf_hooks process punycode querystring readline repl sea sqlite stream string_decoder sys test timers tls trace_events tty url util v8 vm wasi worker_threads zlib".split(
    " ",
  ),
);

export function packageRoot(specifier: string): string | null {
  if (specifier.startsWith("node:")) {
    return "node";
  }

  if (/^(?:[./#]|[a-z]+:)/i.test(specifier)) {
    return null;
  }

  const parts = specifier.split("/");
  if (BUILTINS.has(parts[0])) {
    return "node";
  }

  return specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0] || null;
}

const SCRIPT_FILE = /\.[cm]?[jt]sx?$/;
const IMPORT_SPECIFIER =
  /\b(?:import\s*(?:\(\s*|[^"'`;]*?\bfrom\s*)?|export\s+[^"'`;]*?\bfrom\s*|require\s*\(\s*)["']([^"']+)["']/g;

/** Package roots one file imports; empty for files TypeScript does not check. */
export function fileImports(path: string, content: string): string[] {
  if (!SCRIPT_FILE.test(path)) {
    return [];
  }

  const packages = new Set<string>();

  for (const match of content.matchAll(IMPORT_SPECIFIER)) {
    const name = packageRoot(match[1]);

    if (name) {
      packages.add(name);
    }
  }

  return [...packages];
}

/** Package roots a workspace declares or imports; dependency names come from package.json. */
export function declaredPackages(files: Record<string, string>): string[] {
  return dependencyNames(files)
    .map(packageRoot)
    .filter((name): name is string => name !== null);
}

export function workspacePackages(files: Record<string, string>): string[] {
  const packages = new Set(declaredPackages(files));

  for (const [path, content] of Object.entries(files)) {
    fileImports(path, content).forEach((name) => packages.add(name));
  }

  return [...packages].sort();
}

export function resolvePacks(
  manifest: PackManifest,
  packages: string[],
): string[] {
  const visited = new Set<string>();
  const ordered: string[] = [];

  function visit(id: string) {
    const pack = manifest.packs[id];
    if (!pack || visited.has(id)) {
      return;
    }

    visited.add(id);
    pack.requires.forEach(visit);
    ordered.push(id);
  }

  for (const [id, pack] of Object.entries(manifest.packs)) {
    if (pack.triggers.some((trigger) => packages.includes(trigger))) {
      visit(id);
    }
  }

  return ordered;
}

export function ignoredDiagnostics(loadedPacks: ReadonlySet<string>): number[] {
  // Missing namespaces can belong to packages without a type pack.
  const ignored = [2307, 2792, 7016, 2503];

  if (!loadedPacks.has("node")) {
    ignored.push(2580, 2591);
  }

  if (!loadedPacks.has("react")) {
    ignored.push(2875, 7026);
  }

  return ignored;
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

/** Keeps only well-formed pack entries; an unusable manifest disables type packs. */
export function parseManifest(value: unknown): PackManifest | null {
  if (!isObject(value) || value.version !== 1 || !isObject(value.packs)) {
    return null;
  }

  const packs: PackManifest["packs"] = {};

  for (const [id, pack] of Object.entries(value.packs)) {
    if (!isObject(pack) || typeof pack.file !== "string") {
      continue;
    }

    if (!isStringList(pack.triggers) || !isStringList(pack.requires)) {
      continue;
    }

    packs[id] = {
      file: pack.file,
      triggers: pack.triggers,
      requires: pack.requires,
    };
  }

  return { version: 1, packs };
}
