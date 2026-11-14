"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { CheckIcon } from "@/components/icons";
import { announce } from "@/lib/a11y/announcer";
import { cn } from "@/lib/utils";
import { Button } from "../button/button";

type CopyState = "idle" | "copied" | "failed";

export type CodeBlockProps = {
  code: string;
  language: string | null;
  // False while the closing fence has not arrived yet (streaming).
  complete?: boolean;
  actions?: ReactNode;
  className?: string;
};

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

const COPY_LABELS: Record<CopyState, string> = {
  idle: "Copy",
  copied: "Copied",
  failed: "Copy failed",
};

/** A code block with a language label, a Copy button and optional extra actions. */
export function CodeBlock({
  code,
  language,
  complete = true,
  actions,
  className,
}: CodeBlockProps) {
  const [copyState, setCopyState] = useState<CopyState>("idle");
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(resetTimer.current);
    };
  }, []);

  async function copy() {
    let next: CopyState = "copied";

    try {
      await navigator.clipboard.writeText(code);
    } catch {
      next = "failed";
    }

    setCopyState(next);
    announce(next === "copied" ? "Code copied" : "Could not copy the code");

    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopyState("idle"), 2000);
  }

  const label = language ?? "Code";
  const copyLabel = language ? `Copy ${language} code` : "Copy code";

  return (
    <figure
      data-slot="code-block"
      className={cn(
        "my-3 min-w-0 overflow-hidden rounded-md border border-border bg-muted",
        className,
      )}
    >
      <figcaption className="flex min-h-9 items-center gap-2 border-b border-border px-3 py-1">
        <span className="font-mono text-xs text-muted-foreground">
          {label}
          {!complete && <span className="sr-only"> (still being written)</span>}
        </span>

        <span className="ms-auto flex flex-wrap items-center justify-end gap-1">
          {actions}

          <Button
            variant="ghost"
            size="sm"
            aria-label={
              copyState === "idle" ? copyLabel : COPY_LABELS[copyState]
            }
            onClick={() => void copy()}
          >
            {copyState === "copied" ? <CheckIcon strokeWidth={2} /> : <CopyIcon />}
            {COPY_LABELS[copyState]}
          </Button>
        </span>
      </figcaption>

      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-foreground">
        <code data-language={language ?? undefined}>{code}</code>
      </pre>
    </figure>
  );
}
