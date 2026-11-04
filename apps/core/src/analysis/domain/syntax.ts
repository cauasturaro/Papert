import type { SyntaxChecker } from './ports/syntax-checker.js';

export type Language =
  | 'typescript'
  | 'tsx'
  | 'javascript'
  | 'python'
  | 'yaml'
  | 'dockerfile'
  | 'sql'
  | 'json';

export type Position = { line: number; column: number; message: string };

export type SyntaxDiagnostic = Position & { path: string; language: Language };

// Coverage is explicit: an unchecked file is never reported as syntactically valid.
export type SyntaxReport = {
  status: 'passed' | 'failed';
  coverage: 'complete' | 'partial' | 'none';
  checked: { path: string; language: Language }[];
  unchecked: string[];
  diagnostics: SyntaxDiagnostic[];
};

export const MAX_DIAGNOSTICS = 20;
const MAX_MESSAGE = 300;

const extensions: Record<string, Language> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  py: 'python',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  json: 'json',
};

export function languageOf(path: string): Language | null {
  const name = path.split('/').pop() ?? '';
  if (
    name === 'Dockerfile' ||
    name.startsWith('Dockerfile.') ||
    name.endsWith('.Dockerfile') ||
    name.endsWith('.dockerfile')
  ) {
    return 'dockerfile';
  }

  const dot = name.lastIndexOf('.');
  if (dot <= 0) {
    return null;
  }

  return extensions[name.slice(dot + 1).toLowerCase()] ?? null;
}

// Converts a zero-based UTF-16 offset into one-based editor coordinates.
export function positionAt(source: string, offset: number) {
  const bounded = Math.max(0, Math.min(offset, source.length));
  const before = source.slice(0, bounded).split('\n');

  return {
    line: before.length,
    column: before[before.length - 1].length + 1,
  };
}

export async function lintWorkspace(
  files: Record<string, string>,
  checker: SyntaxChecker,
): Promise<SyntaxReport> {
  const checked: SyntaxReport['checked'] = [];
  const unchecked: string[] = [];
  const diagnostics: SyntaxDiagnostic[] = [];

  // Code-unit order keeps reports identical across server locales.
  const entries = Object.entries(files).sort(([a], [b]) =>
    a < b ? -1 : Number(a > b),
  );

  for (const [path, source] of entries) {
    if (path.endsWith('/')) {
      continue;
    }

    const language = languageOf(path);
    if (!language) {
      unchecked.push(path);
      continue;
    }

    checked.push({ path, language });

    const found = await checker.check(language, source);
    for (const position of found) {
      diagnostics.push({
        path,
        language,
        line: position.line,
        column: position.column,
        message: position.message.slice(0, MAX_MESSAGE),
      });
    }
  }

  let coverage: SyntaxReport['coverage'] = 'partial';
  if (!unchecked.length) {
    coverage = 'complete';
  } else if (!checked.length) {
    coverage = 'none';
  }

  return {
    status: diagnostics.length ? 'failed' : 'passed',
    coverage,
    checked,
    unchecked,
    diagnostics: diagnostics.slice(0, MAX_DIAGNOSTICS),
  };
}
