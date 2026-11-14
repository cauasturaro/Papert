"use client";

import { Fragment, useMemo, type ReactNode } from "react";

import {
  parseMarkdown,
  type Block,
  type Inline,
  type TableAlign,
} from "@/lib/markdown/parse";
import { workspacePath } from "@/lib/markdown/workspace-path";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";

export type MarkdownProps = {
  source: string;
  className?: string;
  // Markdown "#" becomes h(1 + offset); the default keeps answers below page headings (h3).
  headingOffset?: number;
  // Turns inline code that looks like a workspace path into a button.
  onPathClick?: (path: string) => void;
  // Extra buttons beside Copy, such as "Insert at cursor".
  renderCodeActions?: (code: string, language: string | null) => ReactNode;
};

type RenderContext = Required<Pick<MarkdownProps, "headingOffset">> &
  Pick<MarkdownProps, "onPathClick" | "renderCodeActions">;

const HEADING_CLASSES: Record<number, string> = {
  3: "mt-4 mb-2 text-base font-semibold",
  4: "mt-4 mb-2 text-sm font-semibold",
  5: "mt-3 mb-1 text-sm font-semibold",
  6: "mt-3 mb-1 text-sm font-medium text-muted-foreground",
};

function InlineCode({
  value,
  onPathClick,
}: {
  value: string;
  onPathClick?: (path: string) => void;
}) {
  const path = onPathClick ? workspacePath(value) : null;
  const codeClass =
    "rounded-xs bg-muted px-1 py-0.5 font-mono text-[0.9em] wrap-anywhere";

  if (path && onPathClick) {
    return (
      <button
        type="button"
        title={`Open ${path}`}
        className={cn(
          codeClass,
          "cursor-pointer underline decoration-ring decoration-dotted underline-offset-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        )}
        onClick={() => onPathClick(path)}
      >
        {value}
      </button>
    );
  }

  return <code className={codeClass}>{value}</code>;
}

function renderInline(nodes: Inline[], context: RenderContext): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.value}</Fragment>;

      case "break":
        return <br key={index} />;

      case "strong":
        return (
          <strong key={index} className="font-semibold">
            {renderInline(node.children, context)}
          </strong>
        );

      case "emphasis":
        return <em key={index}>{renderInline(node.children, context)}</em>;

      case "code":
        return (
          <InlineCode
            key={index}
            value={node.value}
            onPathClick={context.onPathClick}
          />
        );

      case "link":
        return (
          <a
            key={index}
            href={node.href}
            target="_blank"
            rel="noreferrer"
            className="font-medium underline underline-offset-2 hover:decoration-2"
          >
            {renderInline(node.children, context)}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        );
    }
  });
}

function alignClass(align: TableAlign) {
  if (align === "center") {
    return "text-center";
  }

  if (align === "right") {
    return "text-right";
  }

  return "text-left";
}

function ListItem({
  blocks,
  context,
}: {
  blocks: Block[];
  context: RenderContext;
}) {
  const first = blocks[0];

  // Tight items render their text directly instead of inside a paragraph.
  if (blocks.length === 1 && first?.type === "paragraph") {
    return <li>{renderInline(first.children, context)}</li>;
  }

  return <li className="space-y-2">{renderBlocks(blocks, context)}</li>;
}

function renderBlock(
  block: Block,
  key: number,
  context: RenderContext,
): ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={key}>{renderInline(block.children, context)}</p>;

    case "heading": {
      const level = Math.min(6, block.level + context.headingOffset);
      const Heading = `h${level}` as "h3";

      return (
        <Heading key={key} className={HEADING_CLASSES[Math.max(3, level)]}>
          {renderInline(block.children, context)}
        </Heading>
      );
    }

    case "code": {
      const actions = context.renderCodeActions?.(block.code, block.language);

      return (
        <CodeBlock
          key={key}
          code={block.code}
          language={block.language}
          complete={block.complete}
          actions={actions}
        />
      );
    }

    case "list": {
      const items = block.items.map((blocks, index) => (
        <ListItem key={index} blocks={blocks} context={context} />
      ));

      if (block.ordered) {
        return (
          <ol
            key={key}
            start={block.start}
            className="list-decimal space-y-1 ps-6"
          >
            {items}
          </ol>
        );
      }

      return (
        <ul key={key} className="list-disc space-y-1 ps-6">
          {items}
        </ul>
      );
    }

    case "blockquote":
      return (
        <blockquote
          key={key}
          className="space-y-2 border-s-2 border-border ps-3 text-muted-foreground"
        >
          {renderBlocks(block.children, context)}
        </blockquote>
      );

    case "rule":
      return <hr key={key} className="my-4 border-border" />;

    case "table":
      return (
        <div key={key} className="my-3 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-border">
                {block.header.map((cell, column) => (
                  <th
                    key={column}
                    scope="col"
                    className={cn(
                      "px-2 py-1.5 font-semibold",
                      alignClass(block.align[column]),
                    )}
                  >
                    {renderInline(cell, context)}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  className="border-b border-border last:border-0"
                >
                  {row.map((cell, column) => (
                    <td
                      key={column}
                      className={cn(
                        "px-2 py-1.5 align-top",
                        alignClass(block.align[column]),
                      )}
                    >
                      {renderInline(cell, context)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function renderBlocks(blocks: Block[], context: RenderContext) {
  return blocks.map((block, index) => renderBlock(block, index, context));
}

/**
 * Renders learner or Seymour text written in a Markdown subset as React elements (no
 * HTML injection). Partial text from a stream renders as far as it goes.
 */
export function Markdown({
  source,
  className,
  headingOffset = 2,
  onPathClick,
  renderCodeActions,
}: MarkdownProps) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);

  const context: RenderContext = {
    headingOffset,
    onPathClick,
    renderCodeActions,
  };

  return (
    <div
      data-slot="markdown"
      className={cn(
        "min-w-0 space-y-3 leading-relaxed wrap-anywhere",
        className,
      )}
    >
      {renderBlocks(blocks, context)}
    </div>
  );
}
