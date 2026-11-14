import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));
const INNER_LAYER_PACKAGES = ['zod', 'node:crypto'];

// Every controller authenticates through this guard, so it is part of auth's public surface.
const SHARED_ADAPTERS = ['auth/infrastructure/session.guard.ts'];

// Entry points assemble the application just like the Nest modules do.
const COMPOSITION_ROOTS = [
  /\.module\.ts$/,
  /\/lambda-handlers\.ts$/,
  /\/local-worker\.ts$/,
];

type SourceFile = { path: string; module: string; layer: string };
type Dependency = { from: SourceFile; target: string };

function productionFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      return productionFiles(path);
    }

    const isProduction =
      entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts');

    return isProduction ? [path] : [];
  });
}

function describeFile(absolutePath: string): SourceFile {
  const path = relative(SOURCE_ROOT, absolutePath);
  const [module, layer = ''] = path.split('/');

  return { path, module, layer };
}

function dependencies(absolutePath: string): Dependency[] {
  const from = describeFile(absolutePath);
  const source = readFileSync(absolutePath, 'utf8');
  const specifiers = [...source.matchAll(/from '([^']+)'/g)].map(
    (match) => match[1],
  );

  return specifiers.map((specifier) => {
    if (!specifier.startsWith('.')) {
      return { from, target: specifier };
    }

    const resolved = resolve(dirname(absolutePath), specifier);
    const target = relative(SOURCE_ROOT, resolved).replace(/\.js$/, '.ts');

    return { from, target };
  });
}

const allDependencies = productionFiles(SOURCE_ROOT).flatMap(dependencies);

function violations(isViolation: (dependency: Dependency) => boolean) {
  return allDependencies
    .filter(isViolation)
    .map(({ from, target }) => `${from.path} -> ${target}`);
}

function isInner({ layer }: SourceFile) {
  return layer === 'domain' || layer === 'application';
}

describe('Hexagonal boundaries', () => {
  it('keeps frameworks and SDKs out of the domain and application layers', () => {
    const outwardPackages = violations(({ from, target }) => {
      const isPackage = !target.includes('/') || target.startsWith('@');

      return (
        isInner(from) && isPackage && !INNER_LAYER_PACKAGES.includes(target)
      );
    });

    expect(outwardPackages).toEqual([]);
  });

  it('never points the domain or application layers at an adapter', () => {
    const outwardImports = violations(
      ({ from, target }) =>
        isInner(from) && target.includes('/infrastructure/'),
    );

    expect(outwardImports).toEqual([]);
  });

  it('keeps the domain independent from use cases', () => {
    const upwardImports = violations(
      ({ from, target }) =>
        from.layer === 'domain' && target.includes('/application/'),
    );

    expect(upwardImports).toEqual([]);
  });

  it("builds another module's adapters only in composition roots", () => {
    const foreignAdapters = violations(({ from, target }) => {
      const crossesModules = !target.startsWith(`${from.module}/`);
      const isComposition = COMPOSITION_ROOTS.some((root) =>
        root.test(from.path),
      );

      return (
        target.includes('/infrastructure/') &&
        !target.startsWith('common/') &&
        crossesModules &&
        !isComposition &&
        !SHARED_ADAPTERS.includes(target)
      );
    });

    expect(foreignAdapters).toEqual([]);
  });
});
