"use client";

import {
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion/accordion";
import { Button } from "@/components/ui/button/button";
import { SparklesIcon } from "@/components/icons";
import { formatCount } from "@/lib/format/number";
import type { CodeSelection } from "./use-seymour";

/** The current step as the panel knows it; criteria are the challenge's descriptions. */
export type StepContext = { title: string; criteria?: string[] };

const TITLE_CHARACTERS = 60;
const CRITERION_CHARACTERS = 80;

function shorten(text: string, limit: number) {
  const trimmed = text.trim().replace(/\s+/g, " ");

  if (trimmed.length <= limit) {
    return trimmed;
  }

  return `${trimmed.slice(0, limit - 1)}…`;
}

/** Three or four starting questions built from the step; generic ones when it is unknown. */
export function suggestedPrompts(step: StepContext | null | undefined) {
  if (!step) {
    return [
      "What should I focus on in this step?",
      "Where should I start?",
      "Can you look at my saved code and point out one thing to improve?",
    ];
  }

  const title = shorten(step.title, TITLE_CHARACTERS);
  const prompts = [
    `What does "${title}" ask me to build?`,
    "Where should I start with this step?",
  ];

  const criterion = step.criteria?.[0];

  if (criterion) {
    prompts.push(
      `How can I check that my code meets this: "${shorten(criterion, CRITERION_CHARACTERS)}"?`,
    );
  }

  prompts.push(
    "Can you look at my saved code and point out one thing to improve?",
  );

  return prompts;
}

export function SeymourEmptyState({
  step,
  activeFile,
  selection,
  fileCount,
  sources,
  memories,
  onSuggest,
}: {
  step?: StepContext | null;
  activeFile?: string;
  selection?: CodeSelection;
  fileCount?: number;
  sources: string[];
  memories: number;
  onSuggest: (prompt: string) => void;
}) {
  const prompts = suggestedPrompts(step);

  return (
    <div className="space-y-4 py-4">
      <div className="space-y-1 text-center">
        <SparklesIcon className="mx-auto size-5 text-ring" />
        <h3 className="text-sm font-semibold">Ask Seymour</h3>
        <p className="text-xs text-muted-foreground">
          Seymour gives hints and explanations about your saved code. It does
          not run your code or approve steps.
        </p>
      </div>

      <ul aria-label="Suggested questions" className="space-y-1.5">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <Button
              variant="outline"
              size="sm"
              className="h-auto w-full justify-start py-1.5 text-left text-xs font-normal whitespace-normal"
              onClick={() => onSuggest(prompt)}
            >
              {prompt}
            </Button>
          </li>
        ))}
      </ul>

      <AccordionItem className="rounded-md border border-border px-3 text-xs text-muted-foreground">
        <AccordionTrigger
          size="sm"
          className="py-2 text-xs font-normal text-muted-foreground select-none hover:text-foreground"
        >
          What Seymour sees
        </AccordionTrigger>

        <ul className="list-disc space-y-1 pb-2 pl-4">
          <li>
            Current step: {step ? step.title : "your current roadmap step"}
          </li>
          <li>
            Your saved files
            {fileCount !== undefined && ` (${formatCount(fileCount, "file")})`}
            {activeFile && `, starting with ${activeFile}`}. Unsaved edits are
            not included.
          </li>
          <li>
            {selection
              ? "The code you selected in the editor."
              : "No selection: select code in the editor to point at it."}
          </li>
          <li>
            {sources.length > 0
              ? `Your documents: ${sources.slice(0, 3).join(", ")}${sources.length > 3 ? ` and ${sources.length - 3} more` : ""}.`
              : "No documents yet. Add them in the Sources tab."}
          </li>
          <li>
            {memories > 0
              ? `${formatCount(memories, "memory", "memories")} you approved.`
              : "No memories yet."}
          </li>
        </ul>
      </AccordionItem>
    </div>
  );
}
