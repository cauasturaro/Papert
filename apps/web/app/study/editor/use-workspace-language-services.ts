"use client";

import { useEffect, useMemo, useState } from "react";
import type * as Monaco from "monaco-editor";
import type { Files } from "../workspace/workspace-tree";
import { syncModels } from "./editor-models";
import { languageDefaults, loadTypePacks } from "./typescript/type-pack-loader";
import { WorkspaceTypeIndex } from "./typescript/workspace-type-index";

export function useWorkspaceLanguageServices(
  ready: boolean,
  workspaceId: string,
  files: Files,
  path: string,
) {
  // Serialized so effects only rerun when the derived settings actually change; the index
  // rescans only files whose text changed since the last render.
  const [typeIndex] = useState(() => new WorkspaceTypeIndex());
  const compilerOptions = useMemo(
    () => typeIndex.compilerOptions(workspaceId, files),
    [typeIndex, workspaceId, files],
  );
  const packages = useMemo(() => typeIndex.packages(files), [typeIndex, files]);

  useEffect(() => {
    const monaco = window.papertMonaco;

    if (!ready || !monaco) {
      return;
    }

    syncModels(monaco, workspaceId, files, path);
  }, [ready, workspaceId, files, path]);

  useEffect(() => {
    const monaco = window.papertMonaco;
    if (!ready || !monaco) {
      return;
    }

    const options = JSON.parse(
      compilerOptions,
    ) as Monaco.typescript.CompilerOptions;

    for (const defaults of languageDefaults(monaco)) {
      defaults.setCompilerOptions({
        ...defaults.getCompilerOptions(),
        ...options,
      });
    }
  }, [ready, compilerOptions]);

  useEffect(() => {
    const monaco = window.papertMonaco;
    if (!ready || !monaco) {
      return;
    }

    const timer = setTimeout(() => {
      void loadTypePacks(monaco, JSON.parse(packages) as string[]);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [ready, packages]);

}
