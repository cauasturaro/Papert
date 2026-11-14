import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = path.join(webRoot, "type-packs");
const modulesRoot = path.join(sourceRoot, "node_modules");

export const packs = {
  node: { packages: ["@types/node"], triggers: ["node"] },
  react: {
    packages: ["react", "react-dom", "@types/react", "@types/react-dom"],
    triggers: ["react", "react-dom"],
  },
  next: { packages: ["next"], requires: ["react", "node"] },
  express: {
    packages: ["@types/express"],
    triggers: ["express"],
    requires: ["node"],
  },
  fastify: { packages: ["fastify"], requires: ["node"] },
  hono: { packages: ["hono"] },
  koa: { packages: ["@types/koa"], triggers: ["koa"], requires: ["node"] },
  nestjs: {
    packages: [
      "@nestjs/common",
      "@nestjs/core",
      "@nestjs/config",
      "@nestjs/testing",
      "rxjs",
      "reflect-metadata",
    ],
    requires: ["node"],
  },
  "class-validator": { packages: ["class-validator", "class-transformer"] },
  zod: { packages: ["zod"] },
  "drizzle-orm": {
    packages: ["drizzle-orm"],
    requires: ["node"],
    rootExportOnly: ["drizzle-orm"],
  },
  typeorm: { packages: ["typeorm"], requires: ["node"] },
  mongoose: { packages: ["mongoose"], requires: ["node"] },
  trpc: { packages: ["@trpc/server", "@trpc/client"] },
  langchain: {
    packages: [
      "langchain",
      "@langchain/core",
      "@langchain/openai",
      "@langchain/anthropic",
      "@langchain/langgraph",
    ],
    requires: ["node"],
  },
  ai: { packages: ["ai"], requires: ["node"] },
  openai: { packages: ["openai"], requires: ["node"] },
  anthropic: { packages: ["@anthropic-ai/sdk"], requires: ["node"] },
  axios: { packages: ["axios"] },
  vitest: {
    packages: ["vitest"],
    requires: ["node"],
    rootExportOnly: ["vitest"],
  },
  jest: { packages: ["@types/jest"], triggers: ["jest"] },
  supertest: {
    packages: ["@types/supertest"],
    triggers: ["supertest"],
    requires: ["node"],
  },
};

const compilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  types: [],
  typeRoots: [path.join(modulesRoot, "@types")],
  skipLibCheck: true,
  noEmit: true,
  esModuleInterop: true,
};

export function typeEntries(value) {
  if (typeof value === "string") {
    return /\.d\.[cm]?ts$/.test(value) ? [value] : [];
  }

  if (!value || typeof value !== "object") {
    return [];
  }

  return Object.values(value).flatMap(typeEntries);
}

export function packageDirectory(file, root = modulesRoot) {
  const relative = path.relative(root, file).split(path.sep);
  const lastModules = relative.lastIndexOf("node_modules");
  const offset = lastModules + 1;
  const length = relative[offset].startsWith("@") ? 2 : 1;

  return path.join(root, ...relative.slice(0, offset + length));
}

function packageMetadata(directory) {
  const metadata = JSON.parse(
    readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  const fields = [
    "name",
    "version",
    "types",
    "typings",
    "exports",
    "typesVersions",
    "main",
    "imports",
    "type",
  ];

  return Object.fromEntries(
    fields.filter((key) => key in metadata).map((key) => [key, metadata[key]]),
  );
}

function rootFiles(definition) {
  const roots = [];
  const directories = new Set();

  for (const name of definition.packages) {
    const directory = path.join(modulesRoot, name);
    const metadata = packageMetadata(directory);
    directories.add(directory);

    for (const file of readdirSync(directory).sort()) {
      if (/\.d\.[cm]?ts$/.test(file)) {
        roots.push(path.join(directory, file));
      }
    }

    // Optional database drivers and browser test providers need application-specific peers.
    const exportedTypes = definition.rootExportOnly?.includes(name)
      ? metadata.exports["."]
      : metadata.exports;

    for (const entry of [
      metadata.types,
      metadata.typings,
      ...typeEntries(exportedTypes),
    ]) {
      if (!entry) {
        continue;
      }

      if (entry.includes("*")) {
        roots.push(
          ...ts.sys.readDirectory(
            directory,
            [".d.ts", ".d.mts", ".d.cts"],
            undefined,
            [entry],
          ),
        );
      } else if (ts.sys.fileExists(path.join(directory, entry))) {
        roots.push(path.join(directory, entry));
      }
    }

    const resolved = ts.resolveModuleName(
      name,
      path.join(sourceRoot, "entry.mts"),
      compilerOptions,
      ts.sys,
    ).resolvedModule;
    if (resolved) {
      roots.push(resolved.resolvedFileName);
    }
  }

  return { roots, directories };
}

function programFiles(roots) {
  const files = new Map();
  const directories = new Set();
  const modes = [
    compilerOptions,
    {
      ...compilerOptions,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    },
  ];

  for (const options of modes) {
    const libraryRoot = path.dirname(ts.getDefaultLibFilePath(options));
    const allowedPath = (file) =>
      [modulesRoot, libraryRoot].some(
        (root) => file === root || file.startsWith(`${root}${path.sep}`),
      );
    const host = ts.createCompilerHost(options);
    host.fileExists = (file) => allowedPath(file) && ts.sys.fileExists(file);
    host.directoryExists = (directory) =>
      allowedPath(directory) && ts.sys.directoryExists(directory);
    host.readFile = (file) =>
      allowedPath(file) ? ts.sys.readFile(file) : undefined;

    const program = ts.createProgram(roots, options, host);

    for (const source of program.getSourceFiles()) {
      if (!source.fileName.startsWith(`${modulesRoot}${path.sep}`)) {
        assert(
          program.isSourceFileDefaultLibrary(source),
          `Type source escaped the pinned installation: ${source.fileName}`,
        );

        continue;
      }

      files.set(source.fileName, source.text);

      const packageRoot = packageDirectory(source.fileName);
      directories.add(packageRoot);

      for (
        let directory = path.dirname(source.fileName);
        directory !== packageRoot;
        directory = path.dirname(directory)
      ) {
        if (ts.sys.fileExists(path.join(directory, "package.json"))) {
          directories.add(directory);
        }
      }
    }
  }

  return { files, directories };
}

export function collectFiles(definition) {
  const roots = rootFiles(definition);
  const { files, directories } = programFiles(roots.roots);

  for (const directory of new Set([...roots.directories, ...directories])) {
    files.set(
      path.join(directory, "package.json"),
      JSON.stringify(packageMetadata(directory)),
    );
  }

  return files;
}

export function bundlePacks(definitions, collected) {
  const owners = new Map();
  for (const [id, definition] of Object.entries(definitions)) {
    for (const name of definition.packages) {
      owners.set(path.join(modulesRoot, name), id);
    }
  }

  const consumers = new Map();
  for (const [id, files] of collected) {
    for (const file of files.keys()) {
      const directory = packageDirectory(file);
      const users = consumers.get(directory) ?? new Set();
      users.add(id);
      consumers.set(directory, users);
    }
  }

  const manifest = { version: 1, packs: {} };
  const output = {};
  for (const [id, definition] of Object.entries(definitions)) {
    manifest.packs[id] = {
      file: `${id}.json`,
      triggers: definition.triggers ?? definition.packages,
      requires: [...(definition.requires ?? [])],
    };
    output[id] = { id, files: {} };
  }

  for (const [directory, users] of [...consumers].sort()) {
    if (owners.has(directory)) {
      continue;
    }

    if (users.size === 1) {
      owners.set(directory, [...users][0]);
      continue;
    }

    const id = `shared-${path.relative(modulesRoot, directory).replaceAll(/[^a-zA-Z0-9-]/g, "-")}`;
    owners.set(directory, id);
    manifest.packs[id] = { file: `${id}.json`, triggers: [], requires: [] };
    output[id] = { id, files: {} };
  }

  for (const [id, files] of collected) {
    for (const [file, content] of [...files].sort()) {
      const owner = owners.get(packageDirectory(file));
      const uri = `file:///node_modules/${path.relative(modulesRoot, file).split(path.sep).join("/")}`;
      output[owner].files[uri] = content;

      if (owner !== id) {
        manifest.packs[id].requires.push(owner);
      }
    }
  }

  for (const entry of Object.values(manifest.packs)) {
    entry.requires = [...new Set(entry.requires)].sort();
  }

  return { manifest, output };
}

export function splitLargePacks(result, budget = 1800 * 1024) {
  for (const [id, pack] of Object.entries(result.output)) {
    let chunk = pack;
    let size = 0;
    let number = 0;

    for (const [uri, content] of Object.entries(pack.files)) {
      const bytes = Buffer.byteLength(JSON.stringify({ [uri]: content }));
      assert(bytes <= budget, `Declaration exceeds the pack budget: ${uri}`);

      if (size + bytes > budget) {
        number += 1;
        const chunkId = `${id}-${number}`;
        chunk = { id: chunkId, files: {} };
        result.output[chunkId] = chunk;
        result.manifest.packs[chunkId] = {
          file: `${chunkId}.json`,
          triggers: [],
          requires: [],
        };
        result.manifest.packs[id].requires.push(chunkId);
        size = 0;
      }

      if (chunk !== pack) {
        chunk.files[uri] = content;
        delete pack.files[uri];
      }

      size += bytes;
    }
  }

  return result;
}

export function validatePacks({ manifest, output }) {
  assert.equal(manifest.version, 1);
  const uris = new Set();
  const visited = new Set();

  function visit(id, ancestors = new Set()) {
    assert(manifest.packs[id], `Missing pack: ${id}`);
    assert(
      !ancestors.has(id),
      `Cyclic pack dependency: ${[...ancestors, id].join(" -> ")}`,
    );
    if (visited.has(id)) {
      return;
    }

    for (const dependency of manifest.packs[id].requires) {
      visit(dependency, new Set([...ancestors, id]));
    }

    visited.add(id);
  }

  for (const [id, entry] of Object.entries(manifest.packs)) {
    // Plain before hashing, content-hashed once written.
    assert(
      entry.file === `${id}.json` ||
        (entry.file.startsWith(`${id}-`) &&
          /^-[0-9a-f]{16}\.json$/.test(entry.file.slice(id.length))),
      `Unexpected pack file: ${entry.file}`,
    );
    assert(Array.isArray(entry.triggers));
    assert(Array.isArray(entry.requires));
    assert.equal(output[id].id, id);

    for (const [uri, content] of Object.entries(output[id].files)) {
      assert(uri.startsWith("file:///node_modules/"));
      assert.equal(typeof content, "string");
      assert(!uris.has(uri), `Duplicate URI: ${uri}`);
      uris.add(uri);
    }

    visit(id);
  }
}

export function hashedPackFile(id, content) {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);

  return `${id}-${hash}.json`;
}

export function generate() {
  const collected = new Map(
    Object.entries(packs).map(([id, definition]) => [
      id,
      collectFiles(definition),
    ]),
  );
  const result = splitLargePacks(bundlePacks(packs, collected));
  validatePacks(result);

  const destination = path.join(webRoot, "public/type-packs");
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  // Content-hashed names let packs be cached as immutable; the manifest maps ids to them.
  for (const [id, pack] of Object.entries(result.output)) {
    const content = JSON.stringify(pack);
    const file = hashedPackFile(id, content);

    result.manifest.packs[id].file = file;
    writeFileSync(path.join(destination, file), content);
    console.log(
      `${file}: ${(Buffer.byteLength(content) / 1024).toFixed(1)} KiB`,
    );
  }

  writeFileSync(
    path.join(destination, "manifest.json"),
    JSON.stringify(result.manifest),
  );

  return result;
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  generate();
}
