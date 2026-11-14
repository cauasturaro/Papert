import type * as Monaco from "monaco-editor";
import { dependencyNames, isObject, parseJsonc } from "./workspace-manifest.ts";

type WorkspaceFiles = Record<string, string>;

function resolvePath(path: string, base: string): string {
  return new URL(`./${path.replace(/^\/+/, "")}`, base).href;
}

export function workspaceCompilerOptions(
  workspaceId: string,
  files: WorkspaceFiles,
): Pick<Monaco.typescript.CompilerOptions, "baseUrl" | "paths"> {
  const root = `file:///papert/${workspaceId}/`;
  const config = parseJsonc(
    files["tsconfig.json"] ?? files["jsconfig.json"] ?? "{}",
  );
  const options = isObject(config.compilerOptions)
    ? config.compilerOptions
    : {};
  const configuredBase = typeof options.baseUrl === "string";
  const configuredPaths = isObject(options.paths);
  const baseUrl = resolvePath(
    configuredBase ? (options.baseUrl as string) : "./",
    root,
  );
  const paths: Record<string, string[]> = {};

  if (isObject(options.paths)) {
    for (const [alias, targets] of Object.entries(options.paths)) {
      if (
        Array.isArray(targets) &&
        targets.every((target) => typeof target === "string")
      ) {
        paths[alias] = targets.map((target) =>
          resolvePath(target, `${baseUrl.replace(/\/$/, "")}/`),
        );
      }
    }
  }

  const names = Object.keys(files);
  const nextApp =
    dependencyNames(files).includes("next") ||
    names.some((path) => /^(?:src\/)?app\//.test(path));

  if (!configuredBase && !configuredPaths && nextApp) {
    const sourceRoot = names.some((path) => path.startsWith("src/"));
    paths["@/*"] = [new URL(sourceRoot ? "src/*" : "*", root).href];
  }

  return { baseUrl, paths };
}
