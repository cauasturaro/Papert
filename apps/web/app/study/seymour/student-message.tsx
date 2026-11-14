"use client";

import { PencilIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { optionLabel, reasoningEfforts, tutorModes } from "./seymour-options";
import type { Question } from "./use-seymour";

export function StudentMessage({
  question,
  onEdit,
}: {
  question: Question;
  onEdit: () => void;
}) {
  const showEffort = question.effort !== "low";

  return (
    <div className="group ml-8 space-y-1">
      <p className="rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap text-primary-foreground">
        {question.prompt}
      </p>

      <div className="flex items-center justify-end gap-1">
        <Badge size="sm" variant="outline">
          {optionLabel(tutorModes, question.mode)}
          {showEffort && ` · ${optionLabel(reasoningEfforts, question.effort)}`}
        </Badge>

        <Button
          variant="ghost"
          size="sm"
          iconOnly
          className="size-6"
          aria-label="Edit question"
          title="Edit question"
          onClick={onEdit}
        >
          <PencilIcon />
        </Button>
      </div>
    </div>
  );
}
