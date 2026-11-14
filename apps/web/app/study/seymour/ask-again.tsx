"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu/dropdown-menu";
import { reasoningEfforts, tutorModes } from "./seymour-options";
import type { Question } from "./use-seymour";
import type { TurnHandlers } from "./chat-turn";

export function AskAgain({
  question,
  disabled,
  handlers,
}: {
  question: Question;
  disabled: boolean;
  handlers: TurnHandlers;
}) {
  return (
    <DropdownMenu size="sm">
      <DropdownMenuTrigger
        variant="ghost"
        size="sm"
        className="h-7 text-xs"
        disabled={disabled}
      >
        Ask again
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Ask again as</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {tutorModes.map((mode) => {
          const reason = handlers.modeUnavailable(mode.value);

          return (
            <DropdownMenuItem
              key={mode.value}
              disabled={reason !== null}
              aria-description={reason ?? mode.description}
              onSelect={() => handlers.ask({ ...question, mode: mode.value })}
            >
              {mode.label}
            </DropdownMenuItem>
          );
        })}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>With more thought</DropdownMenuLabel>

        {reasoningEfforts
          .filter((effort) => effort.value !== question.effort)
          .map((effort) => (
            <DropdownMenuItem
              key={effort.value}
              aria-description={effort.description}
              onSelect={() =>
                handlers.ask({ ...question, effort: effort.value })
              }
            >
              {effort.label}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
