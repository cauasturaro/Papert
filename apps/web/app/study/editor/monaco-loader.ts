import type * as Monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";
import { registerFrameworkCompletions } from "./completions";
import { ignoredDiagnostics } from "./typescript/type-packs";
import { languageDefaults } from "./typescript/type-pack-loader";
import { loadMonacoAssets, workerFile } from "./monaco-assets";
import { defineMonacoThemes } from "./monaco-themes";

let loading: Promise<void> | undefined;
let loaded = false;

export function monacoLoaded() {
  return loaded;
}

function configureLanguages(monaco: typeof Monaco) {
  const { typescript } = monaco;

  const compilerOptions: Monaco.typescript.CompilerOptions = {
    target: typescript.ScriptTarget.ESNext,
    module: typescript.ModuleKind.ESNext,
    moduleResolution: typescript.ModuleResolutionKind.NodeJs,
    jsx: typescript.JsxEmit.ReactJSX,
    allowJs: true,
    allowNonTsExtensions: true,
    esModuleInterop: true,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    allowSyntheticDefaultImports: true,
    noEmit: true,
    strict: true,
    lib: ["es2022", "dom", "dom.iterable", "esnext"],
  };

  const diagnostics = {
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: ignoredDiagnostics(new Set()),
  };

  for (const defaults of languageDefaults(monaco)) {
    defaults.setCompilerOptions(compilerOptions);
    defaults.setDiagnosticsOptions(diagnostics);
    // Every workspace file is a model, so relative imports resolve across files.
    defaults.setEagerModelSync(true);
  }

  registerFrameworkCompletions(monaco);
}

function injectEditorScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;

    script.onload = () => {
      const monaco = window.papertMonaco;

      if (!monaco) {
        reject(new Error("Editor did not initialize."));
        return;
      }

      loader.config({ monaco });
      defineMonacoThemes(monaco);
      configureLanguages(monaco);
      loaded = true;
      resolve();
    };

    script.onerror = () => {
      script.remove();
      reject(new Error("Unable to load editor."));
    };

    document.head.appendChild(script);
  });
}

async function loadEditor() {
  const assets = await loadMonacoAssets();

  window.MonacoEnvironment = {
    getWorker: (_id, label) =>
      new Worker(`/monaco/${workerFile(assets, label)}`, { type: "module" }),
  };

  await injectEditorScript(`/monaco/${assets.editor}`);
}

export function loadMonaco() {
  if (!loading) {
    loading = loadEditor().catch((error: unknown) => {
      // A failed load can be retried by the next editor mount.
      loading = undefined;
      throw error;
    });
  }

  return loading;
}
