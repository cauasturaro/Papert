/**
 * A small Markdown subset parsed into plain data, so text from learners and Seymour is
 * rendered as React elements and never as HTML. Unfinished input (a streaming answer)
 * degrades to literal text; an unclosed code fence becomes an open code block.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "strong"; children: Inline[] }
  | { type: "emphasis"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "break" };

export type TableAlign = "left" | "center" | "right" | null;

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "heading"; level: number; children: Inline[] }
  | { type: "code"; language: string | null; code: string; complete: boolean }
  | { type: "list"; ordered: boolean; start: number; items: Block[][] }
  | { type: "blockquote"; children: Block[] }
  | { type: "rule" }
  | {
      type: "table";
      align: TableAlign[];
      header: Inline[][];
      rows: Inline[][][];
    };

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>\s?(.*)$/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(?:(\s+)(.*))?$/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function isBlank(line: string) {
  return line.trim() === "";
}

function indentOf(line: string) {
  return line.length - line.trimStart().length;
}

type ListMarker = {
  indent: number;
  ordered: boolean;
  start: number;
  contentOffset: number;
  content: string;
};

function listMarker(line: string): ListMarker | null {
  const match = LIST_ITEM.exec(line.replace(/\t/g, "    "));

  if (!match) {
    return null;
  }

  // "-" alone is a list item only with content; "---" is a rule.
  if (RULE.test(line)) {
    return null;
  }

  const [, spaces, marker, gap = " ", content = ""] = match;
  const ordered = /\d/.test(marker);
  // Five or more spaces after the marker start indented content, not a wider item.
  const gapWidth = gap.length > 4 ? 1 : gap.length;

  return {
    indent: spaces.length,
    ordered,
    start: ordered ? Number.parseInt(marker, 10) : 1,
    contentOffset: spaces.length + marker.length + gapWidth,
    content,
  };
}

function startsBlock(line: string) {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    listMarker(line) !== null
  );
}

function splitRow(line: string) {
  let row = line.trim();

  if (row.startsWith("|")) {
    row = row.slice(1);
  }

  if (row.endsWith("|") && !row.endsWith("\\|")) {
    row = row.slice(0, -1);
  }

  return row
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

function tableAlign(cell: string): TableAlign {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");

  if (left && right) {
    return "center";
  }

  if (right) {
    return "right";
  }

  return left ? "left" : null;
}

function isTableStart(lines: string[], index: number) {
  const header = lines[index];
  const divider = lines[index + 1];

  if (divider === undefined || !header.includes("|")) {
    return false;
  }

  return TABLE_DIVIDER.test(divider) && divider.includes("-");
}

type Parsed<T> = { node: T; next: number };

function parseFence(lines: string[], index: number): Parsed<Block> {
  const opening = FENCE.exec(lines[index]);
  const fence = opening?.[1] ?? "```";
  const language = opening?.[2] ? opening[2].toLowerCase() : null;
  const indent = indentOf(lines[index]);
  const body: string[] = [];
  let cursor = index + 1;

  while (cursor < lines.length) {
    const line = lines[cursor];
    const closing = line.trim();

    if (
      closing.startsWith(fence[0].repeat(fence.length)) &&
      /^(`+|~+)$/.test(closing)
    ) {
      const node: Block = {
        type: "code",
        language,
        code: body.join("\n"),
        complete: true,
      };

      return { node, next: cursor + 1 };
    }

    // Content keeps its own indentation minus the fence's.
    body.push(line.slice(Math.min(indent, indentOf(line))));
    cursor += 1;
  }

  const node: Block = {
    type: "code",
    language,
    code: body.join("\n"),
    complete: false,
  };

  return { node, next: cursor };
}

function parseQuote(lines: string[], index: number): Parsed<Block> {
  const inner: string[] = [];
  let cursor = index;

  while (cursor < lines.length) {
    const match = QUOTE.exec(lines[cursor]);

    if (!match) {
      break;
    }

    inner.push(match[1]);
    cursor += 1;
  }

  return {
    node: { type: "blockquote", children: parseBlocks(inner) },
    next: cursor,
  };
}

function parseList(lines: string[], index: number): Parsed<Block> {
  const first = listMarker(lines[index]) as ListMarker;
  const items: string[][] = [[first.content]];
  let offset = first.contentOffset;
  let cursor = index + 1;

  while (cursor < lines.length) {
    const line = lines[cursor];
    const marker = listMarker(line);
    const sibling = marker !== null && marker.indent <= first.indent + 1;

    if (isBlank(line)) {
      let ahead = cursor + 1;

      while (ahead < lines.length && isBlank(lines[ahead])) {
        ahead += 1;
      }

      const nextLine = lines[ahead];
      const nextMarker = nextLine === undefined ? null : listMarker(nextLine);
      const continuesItem =
        nextLine !== undefined && indentOf(nextLine) >= offset;
      const continuesList =
        nextMarker !== null &&
        nextMarker.indent <= first.indent + 1 &&
        nextMarker.ordered === first.ordered;

      if (!continuesItem && !continuesList) {
        break;
      }

      items[items.length - 1].push("");
      cursor += 1;
      continue;
    }

    if (sibling) {
      if (marker.ordered !== first.ordered) {
        break;
      }

      items.push([marker.content]);
      offset = marker.contentOffset;
      cursor += 1;
      continue;
    }

    if (indentOf(line) >= first.indent + 2) {
      const removed = Math.min(indentOf(line), offset);

      items[items.length - 1].push(line.slice(removed));
      cursor += 1;
      continue;
    }

    // An unindented line continues the item's text unless it starts another block.
    if (startsBlock(line)) {
      break;
    }

    items[items.length - 1].push(line.trim());
    cursor += 1;
  }

  const node: Block = {
    type: "list",
    ordered: first.ordered,
    start: first.start,
    items: items.map((itemLines) => parseBlocks(itemLines)),
  };

  return { node, next: cursor };
}

function parseTable(lines: string[], index: number): Parsed<Block> {
  const header = splitRow(lines[index]);
  const align = splitRow(lines[index + 1]).map(tableAlign);
  const rows: Inline[][][] = [];
  let cursor = index + 2;

  while (
    cursor < lines.length &&
    lines[cursor].includes("|") &&
    !isBlank(lines[cursor])
  ) {
    const cells = splitRow(lines[cursor]);
    const padded = header.map((_, column) => parseInline(cells[column] ?? ""));

    rows.push(padded);
    cursor += 1;
  }

  const node: Block = {
    type: "table",
    align: header.map((_, column) => align[column] ?? null),
    header: header.map((cell) => parseInline(cell)),
    rows,
  };

  return { node, next: cursor };
}

function parseParagraph(lines: string[], index: number): Parsed<Block> {
  const text: string[] = [lines[index].trim()];
  let cursor = index + 1;

  while (cursor < lines.length) {
    const line = lines[cursor];

    if (isBlank(line) || startsBlock(line) || isTableStart(lines, cursor)) {
      break;
    }

    text.push(line.trim());
    cursor += 1;
  }

  return {
    node: { type: "paragraph", children: parseInline(text.join("\n")) },
    next: cursor,
  };
}

function parseBlockAt(lines: string[], index: number): Parsed<Block> {
  const line = lines[index];

  if (FENCE.test(line)) {
    return parseFence(lines, index);
  }

  const heading = HEADING.exec(line);

  if (heading) {
    const node: Block = {
      type: "heading",
      level: heading[1].length,
      children: parseInline(heading[2] ?? ""),
    };

    return { node, next: index + 1 };
  }

  if (RULE.test(line)) {
    return { node: { type: "rule" }, next: index + 1 };
  }

  if (QUOTE.test(line)) {
    return parseQuote(lines, index);
  }

  if (listMarker(line)) {
    return parseList(lines, index);
  }

  if (isTableStart(lines, index)) {
    return parseTable(lines, index);
  }

  return parseParagraph(lines, index);
}

function parseBlocks(lines: string[]): Block[] {
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    if (isBlank(lines[index])) {
      index += 1;
      continue;
    }

    const { node, next } = parseBlockAt(lines, index);

    blocks.push(node);
    index = next;
  }

  return blocks;
}

/** Parses Markdown into blocks; never throws. */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");

  return parseBlocks(lines);
}

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|>~]/;
const BARE_URL = /^https?:\/\/[^\s<>()]+/i;

/** Only absolute http(s) URLs become links. */
export function safeHref(value: string) {
  const href = value.trim();

  if (!/^https?:\/\//i.test(href)) {
    return null;
  }

  try {
    const url = new URL(href);

    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function pushText(nodes: Inline[], value: string) {
  const last = nodes[nodes.length - 1];

  if (last?.type === "text") {
    last.value += value;
  } else if (value) {
    nodes.push({ type: "text", value });
  }
}

function isWordChar(char: string | undefined) {
  return char !== undefined && /[\p{L}\p{N}]/u.test(char);
}

// Finds a closing delimiter that is not preceded by whitespace.
function findClosing(text: string, delimiter: string, from: number) {
  let cursor = text.indexOf(delimiter, from);

  while (cursor !== -1) {
    const before = text[cursor - 1];
    const after = text[cursor + delimiter.length];
    const single = delimiter.length === 1;
    const doubled = single && (after === delimiter || before === delimiter);
    const intraword = delimiter[0] === "_" && isWordChar(after);

    if (
      cursor > from &&
      before !== " " &&
      before !== "\\" &&
      !doubled &&
      !intraword
    ) {
      return cursor;
    }

    cursor = text.indexOf(delimiter, cursor + 1);
  }

  return -1;
}

function parseLink(text: string, index: number) {
  const labelEnd = text.indexOf("](", index + 1);

  if (labelEnd === -1 || text.slice(index + 1, labelEnd).includes("\n")) {
    return null;
  }

  const urlEnd = text.indexOf(")", labelEnd + 2);

  if (urlEnd === -1) {
    return null;
  }

  const label = text.slice(index + 1, labelEnd);
  const target =
    text
      .slice(labelEnd + 2, urlEnd)
      .trim()
      .split(/\s+/)[0] ?? "";

  return { label, href: safeHref(target), next: urlEnd + 1 };
}

/** Parses inline markup: code spans, strong/emphasis, http(s) links and bare URLs. */
export function parseInline(text: string): Inline[] {
  const nodes: Inline[] = [];
  let index = 0;

  while (index < text.length) {
    const char = text[index];
    const rest = text.slice(index);

    if (char === "\\" && ESCAPABLE.test(text[index + 1] ?? "")) {
      pushText(nodes, text[index + 1]);
      index += 2;
      continue;
    }

    if (char === "\n") {
      nodes.push({ type: "break" });
      index += 1;
      continue;
    }

    if (char === "`") {
      const run = /^`+/.exec(rest)?.[0] ?? "`";
      const close = text.indexOf(run, index + run.length);

      if (close !== -1) {
        const value = text.slice(index + run.length, close).replace(/\n/g, " ");
        const trimmed = /^ .* $/.test(value) ? value.slice(1, -1) : value;

        nodes.push({ type: "code", value: trimmed });
        index = close + run.length;
        continue;
      }

      pushText(nodes, run);
      index += run.length;
      continue;
    }

    if (char === "*" || char === "_") {
      const strong = text[index + 1] === char;
      const delimiter = strong ? char + char : char;
      // "snake_case" and "2*3*4" stay literal; prose rarely emphasizes inside a word.
      const opensIntraword =
        isWordChar(text[index - 1]) &&
        (char === "_" || (!strong && isWordChar(text[index + 1])));
      const close = opensIntraword
        ? -1
        : findClosing(text, delimiter, index + delimiter.length);
      const opensWithSpace = text[index + delimiter.length] === " ";

      if (close !== -1 && !opensWithSpace) {
        const inner = parseInline(text.slice(index + delimiter.length, close));

        nodes.push(
          strong
            ? { type: "strong", children: inner }
            : { type: "emphasis", children: inner },
        );
        index = close + delimiter.length;
        continue;
      }

      pushText(nodes, delimiter);
      index += delimiter.length;
      continue;
    }

    if (char === "[") {
      const link = parseLink(text, index);

      if (link) {
        const children = parseInline(link.label);

        if (link.href) {
          nodes.push({ type: "link", href: link.href, children });
        } else {
          nodes.push(...children);
        }

        index = link.next;
        continue;
      }
    }

    // A URL right after "](" belongs to a link that has not finished streaming.
    const insideLink = text.slice(index - 2, index) === "](";

    if (
      (char === "h" || char === "H") &&
      !isWordChar(text[index - 1]) &&
      !insideLink
    ) {
      const url = BARE_URL.exec(rest)?.[0];
      // Sentence punctuation after a URL is not part of it.
      const trimmed = url?.replace(/[.,:;!?'"]+$/, "");
      const href = trimmed ? safeHref(trimmed) : null;

      if (trimmed && href) {
        nodes.push({
          type: "link",
          href,
          children: [{ type: "text", value: trimmed }],
        });
        index += trimmed.length;
        continue;
      }
    }

    pushText(nodes, char);
    index += 1;
  }

  return nodes;
}
