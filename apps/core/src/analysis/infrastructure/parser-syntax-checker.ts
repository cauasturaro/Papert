import { createRequire } from 'node:module';
import ts from 'typescript';
import { parse as parseSql } from 'libpg-query';
import { Language as GrammarLanguage, Parser } from 'web-tree-sitter';
import type { Node } from 'web-tree-sitter';
import { parseAllDocuments } from 'yaml';
import { checkDockerfile } from '../domain/dockerfile-syntax.js';
import { positionAt } from '../domain/syntax.js';
import type { Language, Position, SyntaxChecker } from '../domain/syntax.js';

// Parsers only build syntax trees; nothing here evaluates or imports learner code.
const PARSE_TIMEOUT_MS = 1000;
const MAX_PER_FILE = 5;

const require = createRequire(import.meta.url);
let python: Promise<Parser> | undefined;

async function pythonParser() {
  python ??= (async () => {
    await Parser.init();

    const grammar = await GrammarLanguage.load(
      require.resolve('tree-sitter-wasms/out/tree-sitter-python.wasm'),
    );
    const parser = new Parser();
    parser.setLanguage(grammar);

    return parser;
  })();

  return python;
}

function checkScript(language: Language, source: string): Position[] {
  const fileName = {
    typescript: 'module.ts',
    tsx: 'module.tsx',
    javascript: 'module.jsx',
  }[language as 'typescript' | 'tsx' | 'javascript'];

  // Transpiling one isolated module reports only syntactic errors; imports and types stay unresolved.
  const output = ts.transpileModule(source, {
    fileName,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.Latest,
      jsx: ts.JsxEmit.Preserve,
      noEmit: true,
    },
  });
  const parsed = (output.diagnostics ?? []).filter(
    (diagnostic) =>
      diagnostic.file && diagnostic.category === ts.DiagnosticCategory.Error,
  );

  return parsed.slice(0, MAX_PER_FILE).map((diagnostic) => {
    const location = diagnostic.file!.getLineAndCharacterOfPosition(
      diagnostic.start ?? 0,
    );

    return {
      line: location.line + 1,
      column: location.character + 1,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    };
  });
}

async function checkPython(source: string): Promise<Position[]> {
  const parser = await pythonParser();
  const deadline = Date.now() + PARSE_TIMEOUT_MS;

  const tree = parser.parse(source, null, {
    progressCallback: () => Date.now() > deadline,
  });
  if (!tree) {
    return [{ line: 1, column: 1, message: 'Python parsing timed out.' }];
  }

  const found: Position[] = [];
  const pending: Node[] = [tree.rootNode];

  while (pending.length && found.length < MAX_PER_FILE) {
    const node = pending.shift()!;
    if (!node.hasError && !node.isMissing) {
      continue;
    }

    if (node.isError || node.isMissing) {
      const message = node.isMissing
        ? `Missing ${node.type}.`
        : `Invalid syntax near "${node.text.slice(0, 40)}".`;
      found.push({
        line: node.startPosition.row + 1,
        column: node.startPosition.column + 1,
        message,
      });
      continue;
    }

    pending.push(...node.children.filter((child) => child !== null));
  }

  tree.delete();

  return found;
}

function checkJson(source: string): Position[] {
  try {
    JSON.parse(source);

    return [];
  } catch (error) {
    const message = (error as Error).message;
    const offset = /position (\d+)/.exec(message);
    const location = positionAt(
      source,
      offset ? Number(offset[1]) : source.length,
    );

    return [{ ...location, message: message.split(' (line')[0] }];
  }
}

function checkYaml(source: string): Position[] {
  // Aliases stay unresolved because no document is converted to JavaScript values.
  const documents = parseAllDocuments(source, { prettyErrors: false });
  const list = Array.isArray(documents) ? documents : [];

  return list
    .flatMap((document) => document.errors)
    .slice(0, MAX_PER_FILE)
    .map((error) => {
      const location = positionAt(source, error.pos[0]);

      return { ...location, message: error.message.split('\n')[0] };
    });
}

async function checkSql(source: string): Promise<Position[]> {
  try {
    await parseSql(source);

    return [];
  } catch (error) {
    const details = (
      error as { sqlDetails?: { cursorPosition?: number; message?: string } }
    ).sqlDetails;
    const location = positionAt(source, details?.cursorPosition ?? 0);

    return [
      {
        ...location,
        message: details?.message ?? 'Invalid PostgreSQL syntax.',
      },
    ];
  }
}

export class ParserSyntaxChecker implements SyntaxChecker {
  async check(language: Language, source: string): Promise<Position[]> {
    if (language === 'python') {
      return checkPython(source);
    }

    if (language === 'json') {
      return checkJson(source);
    }

    if (language === 'yaml') {
      return checkYaml(source);
    }

    if (language === 'sql') {
      return checkSql(source);
    }

    if (language === 'dockerfile') {
      return checkDockerfile(source).slice(0, MAX_PER_FILE);
    }

    return checkScript(language, source);
  }
}
