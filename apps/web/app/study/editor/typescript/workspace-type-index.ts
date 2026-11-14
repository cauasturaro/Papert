import { declaredPackages, fileImports } from "./type-packs.ts";
import { workspaceCompilerOptions } from "./workspace-compiler.ts";

type WorkspaceFiles = Record<string, string>;

type Cached<T> = { source: string; value: T };

const CONFIG_FILES = ["package.json", "tsconfig.json", "jsconfig.json"];

/**
 * Type information the editor derives from a workspace, recomputed only for what changed.
 * An edit keeps every other file's string, so unchanged files are recognised by reference
 * and a keystroke rescans one file instead of the whole workspace.
 */
export class WorkspaceTypeIndex {
  #imports = new Map<string, Cached<string[]>>();
  #declared: Cached<string[]> | null = null;
  #compiler: Cached<string> | null = null;

  /** Sorted package roots, serialized so effects compare them cheaply. */
  packages(files: WorkspaceFiles): string {
    const manifest = files["package.json"] ?? "";

    if (this.#declared?.source !== manifest) {
      this.#declared = { source: manifest, value: declaredPackages(files) };
    }

    const packages = new Set(this.#declared.value);

    for (const [path, content] of Object.entries(files)) {
      let cached = this.#imports.get(path);

      if (cached?.source !== content) {
        cached = { source: content, value: fileImports(path, content) };
        this.#imports.set(path, cached);
      }

      cached.value.forEach((name) => packages.add(name));
    }

    for (const path of this.#imports.keys()) {
      if (!Object.hasOwn(files, path)) {
        this.#imports.delete(path);
      }
    }

    return JSON.stringify([...packages].sort());
  }

  /** Compiler options from the config files and file names; file contents do not matter. */
  compilerOptions(workspaceId: string, files: WorkspaceFiles): string {
    const configs = CONFIG_FILES.map((name) => files[name] ?? "");
    const source = [workspaceId, ...configs, ...Object.keys(files)].join("\0");

    if (this.#compiler?.source !== source) {
      const options = workspaceCompilerOptions(workspaceId, files);

      this.#compiler = { source, value: JSON.stringify(options) };
    }

    return this.#compiler.value;
  }
}
