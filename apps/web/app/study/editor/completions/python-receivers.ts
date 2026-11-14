export function receiverType(
  source: string,
  receiver: string,
): string | undefined {
  const escaped = receiver.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const assignment = new RegExp(
    `^\\s*${escaped}\\s*(?::[^=\\n]+)?=([^\\n]*)`,
    "gm",
  );
  const assignments = [...source.matchAll(assignment)];
  const latestAssignment = assignments[assignments.length - 1];

  if (latestAssignment) {
    return /^\s*(FastAPI|Flask|APIRouter)\s*\(/.exec(latestAssignment[1])?.[1];
  }

  const djangoImports = source.matchAll(
    /^\s*from\s+django\.db\s+import\s+([^\n#]+)/gm,
  );

  for (const imported of djangoImports) {
    for (const name of imported[1].split(",")) {
      const modelsImport = /^models(?:\s+as\s+(\w+))?$/.exec(name.trim());

      if (modelsImport && (modelsImport[1] ?? "models") === receiver) {
        return "django.models";
      }
    }
  }

  return undefined;
}
