import type { Position } from './syntax.js';

// Mirrors the BuildKit Dockerfile frontend grammar for the rules that make a build fail at parse time.
const INSTRUCTIONS = new Set([
  'ADD',
  'ARG',
  'CMD',
  'COPY',
  'ENTRYPOINT',
  'ENV',
  'EXPOSE',
  'FROM',
  'HEALTHCHECK',
  'LABEL',
  'MAINTAINER',
  'ONBUILD',
  'RUN',
  'SHELL',
  'STOPSIGNAL',
  'USER',
  'VOLUME',
  'WORKDIR',
]);

type Instruction = { line: number; keyword: string; args: string };

function tokens(args: string) {
  return args.split(/\s+/).filter(Boolean);
}

function withoutFlags(args: string) {
  return tokens(args).filter((token) => !token.startsWith('--'));
}

function jsonArray(args: string) {
  try {
    const value: unknown = JSON.parse(args);

    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  } catch {
    return false;
  }
}

function validate(instruction: Instruction): string | null {
  const { keyword, args } = instruction;

  if (!INSTRUCTIONS.has(keyword)) {
    return `Unknown instruction: ${keyword}.`;
  }

  if (!args.trim()) {
    return `${keyword} requires at least one argument.`;
  }

  if (keyword === 'SHELL' && !jsonArray(args)) {
    return 'SHELL requires the JSON array form.';
  }

  if (keyword === 'ENV' || keyword === 'LABEL') {
    const parts = tokens(args);
    const pairs = parts[0].includes('=');
    if (pairs && !parts.every((part) => /^[^=]+=/.test(part))) {
      return `${keyword} expects key=value pairs.`;
    }

    if (!pairs && (keyword === 'LABEL' || parts.length < 2)) {
      return `${keyword} expects a key and a value.`;
    }
  }

  if (
    (keyword === 'COPY' || keyword === 'ADD') &&
    !args.trim().startsWith('[')
  ) {
    if (withoutFlags(args).length < 2) {
      return `${keyword} requires a source and a destination.`;
    }
  }

  if (keyword === 'EXPOSE') {
    const invalid = tokens(args).find(
      (port) =>
        !port.includes('$') &&
        !/^\d{1,5}(-\d{1,5})?(\/(tcp|udp|sctp))?$/i.test(port),
    );
    if (invalid) {
      return `Invalid port specification: ${invalid}.`;
    }
  }

  if (keyword === 'HEALTHCHECK') {
    const rest = withoutFlags(args);
    const command = rest[0]?.toUpperCase();
    if (command !== 'NONE' && command !== 'CMD') {
      return 'HEALTHCHECK expects NONE or CMD.';
    }
  }

  if (keyword === 'ONBUILD') {
    const [nested = '', ...rest] = args.trim().split(/\s+/);
    const nestedKeyword = nested.toUpperCase();
    if (['ONBUILD', 'FROM', 'MAINTAINER'].includes(nestedKeyword)) {
      return `ONBUILD cannot trigger ${nestedKeyword}.`;
    }

    return validate({
      line: instruction.line,
      keyword: nestedKeyword,
      args: rest.join(' '),
    });
  }

  return null;
}

function consumeHeredocs(
  lines: string[],
  index: number,
  instruction: Instruction,
  diagnostics: Position[],
) {
  for (const heredoc of instruction.args.matchAll(
    /<<-?(["']?)([A-Za-z_][A-Za-z0-9_]*)\1/g,
  )) {
    const terminator = heredoc[2];
    const strip = heredoc[0].startsWith('<<-');
    const end = lines.findIndex(
      (candidate, position) =>
        position >= index &&
        (strip ? candidate.replace(/^\t+/, '') : candidate) === terminator,
    );
    if (end < 0) {
      diagnostics.push({
        line: instruction.line,
        column: 1,
        message: `Unterminated heredoc: ${terminator}.`,
      });
      index = lines.length;
      break;
    }

    index = end + 1;
  }

  return index;
}

function readDockerfileInstructions(source: string) {
  const lines = source.split(/\r?\n/);
  const instructions: Instruction[] = [];
  const diagnostics: Position[] = [];
  let escape = '\\';
  let directives = true;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    const start = index + 1;
    index++;

    // Parser directives are only recognized before the first instruction, comment or blank line.
    const directive = /^#\s*escape\s*=\s*([`\\])\s*$/i.exec(trimmed);
    if (directives && directive) {
      escape = directive[1];
      continue;
    }

    if (!trimmed || trimmed.startsWith('#')) {
      directives = false;
      continue;
    }

    directives = false;

    // Comment and blank lines inside a continuation are skipped without ending it.
    let logical = line;
    let continued = line.trimEnd().endsWith(escape);
    if (continued) {
      logical = line.trimEnd().slice(0, -1);
    }

    while (continued && index < lines.length) {
      const next = lines[index];
      index++;
      if (!next.trim() || next.trim().startsWith('#')) {
        continue;
      }

      continued = next.trimEnd().endsWith(escape);
      logical += ' ' + (continued ? next.trimEnd().slice(0, -1) : next);
    }

    const match = /^\s*(\S+)\s*(.*)$/.exec(logical)!;
    const instruction = {
      line: start,
      keyword: match[1].toUpperCase(),
      args: match[2],
    };
    instructions.push(instruction);

    index = consumeHeredocs(lines, index, instruction, diagnostics);
  }

  return { instructions, diagnostics };
}

export function checkDockerfile(source: string): Position[] {
  const { instructions, diagnostics } = readDockerfileInstructions(source);

  const first = instructions.find((item) => item.keyword !== 'ARG');
  if (first && first.keyword !== 'FROM') {
    diagnostics.push({
      line: first.line,
      column: 1,
      message: 'The first instruction must be FROM (only ARG may precede it).',
    });
  }

  if (!instructions.some((item) => item.keyword === 'FROM')) {
    diagnostics.push({
      line: 1,
      column: 1,
      message: 'A Dockerfile requires a FROM instruction.',
    });
  }

  for (const instruction of instructions) {
    const message = validate(instruction);
    if (message) {
      diagnostics.push({ line: instruction.line, column: 1, message });
    }
  }

  return diagnostics.sort((a, b) => a.line - b.line);
}
