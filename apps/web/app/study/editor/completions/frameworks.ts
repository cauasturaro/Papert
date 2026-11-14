import type { Framework } from "./types.ts";

export type WorkspaceFile = { path: string; content: string };

export function workspacePrefix(uri: string): string | undefined {
  return /^file:\/\/\/papert\/[^/]+\//.exec(uri)?.[0];
}

export function isManifest(path: string): boolean {
  return /(?:^|\/)(?:pom\.xml|build\.gradle(?:\.kts)?|requirements[^/]*\.txt|pyproject\.toml|Pipfile|setup\.cfg)$/i.test(
    path,
  );
}

const pythonPackages: [Framework, RegExp][] = [
  ["flask", /\bflask\b/],
  ["fastapi", /\bfastapi\b/],
  ["django", /\bdjango\b/],
  ["drf", /\b(?:djangorestframework|rest_framework)\b/],
  ["pydantic", /\bpydantic\b/],
  ["sqlalchemy", /\bsqlalchemy\b/],
  ["langchain", /\blangchain(?:[-_]core)?\b/],
  ["langchain-openai", /\blangchain[-_]openai\b/],
  ["langchain-anthropic", /\blangchain[-_]anthropic\b/],
  ["langgraph", /\blanggraph\b/],
  ["pytest", /\bpytest\b/],
  ["requests", /\brequests\b/],
  ["httpx", /\bhttpx\b/],
];

const springModules: [Framework, RegExp][] = [
  [
    "spring-web",
    /spring-boot-starter-web(?:flux)?\b|org\.springframework\.(?:web|http)\./,
  ],
  [
    "spring-jpa",
    /spring-boot-starter-data-jpa\b|org\.springframework\.data\.jpa\.|jakarta\.persistence\./,
  ],
  [
    "spring-security",
    /spring-boot-starter-security\b|org\.springframework\.security\./,
  ],
  [
    "spring-validation",
    /spring-boot-starter-validation\b|jakarta\.validation\.|org\.springframework\.validation\./,
  ],
  [
    "spring-test",
    /spring-boot-starter-test\b|org\.springframework\.(?:boot\.test|test)\.|org\.junit\./,
  ],
];

function isJavaManifest(path: string): boolean {
  return /(?:pom\.xml|build\.gradle(?:\.kts)?)$/.test(path);
}

// Every rule implies one framework from a single member, so applying the
// rules to each evidence source and merging equals applying them to the union.
function withImpliedFrameworks(detected: Set<Framework>): Set<Framework> {
  if (detected.has("drf")) {
    detected.add("django");
  }

  if (detected.has("fastapi")) {
    detected.add("pydantic");
  }

  if (
    detected.has("langchain-openai") ||
    detected.has("langchain-anthropic") ||
    detected.has("langgraph")
  ) {
    detected.add("langchain");
  }

  return detected;
}

function detect(javaEvidence: string, pythonEvidence: string): Set<Framework> {
  const detected = new Set<Framework>();

  if (/spring-boot|org\.springframework\./.test(javaEvidence)) {
    detected.add("spring");
  }

  for (const [framework, pattern] of springModules) {
    if (pattern.test(javaEvidence)) {
      detected.add(framework);
      detected.add("spring");
    }
  }

  for (const [framework, pattern] of pythonPackages) {
    if (pattern.test(pythonEvidence)) {
      detected.add(framework);
    }
  }

  return withImpliedFrameworks(detected);
}

export function manifestFrameworks(files: WorkspaceFile[]): Set<Framework> {
  const javaManifests = files.filter((file) => isJavaManifest(file.path));
  const pythonManifests = files.filter(
    (file) => isManifest(file.path) && !javaManifests.includes(file),
  );

  const javaEvidence = javaManifests
    .map((file) =>
      file.content.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/.*$/gm, ""),
    )
    .join("\n");
  const pythonEvidence = pythonManifests
    .map((file) => file.content.replace(/#.*$/gm, ""))
    .join("\n")
    .toLowerCase();

  return detect(javaEvidence, pythonEvidence);
}

function pythonImportedModules(imports: string): string {
  return imports
    .split("\n")
    .flatMap((line) => {
      const fromImport = /^\s*from\s+([\w.]+)\s+import\b/.exec(line);

      if (fromImport) {
        return fromImport[1].split(".")[0];
      }

      const directImport = /^\s*import\s+(.+)/.exec(line);

      return (directImport?.[1].split(",") ?? []).map(
        (name) => name.trim().split(/[.\s]/)[0],
      );
    })
    .join("\n");
}

export function sourceFrameworks(source: string): Set<Framework> {
  const imports =
    source
      .match(/^\s*(?:from\s+[\w.]+\s+import\b[^\n]*|import\s+[^\n;]+)/gm)
      ?.join("\n")
      .replace(/#.*$/gm, "") ?? "";

  const pythonEvidence = pythonImportedModules(imports).toLowerCase();

  return detect(imports, pythonEvidence);
}
