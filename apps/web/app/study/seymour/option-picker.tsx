"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu/dropdown-menu";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";
import { optionLabel, type SeymourOption } from "./seymour-options";

/** A compact pill that opens the options with their one-line descriptions. */
export function OptionPicker({
  label,
  value,
  options,
  unavailable,
  onValueChange,
}: {
  label: string;
  value: string;
  options: SeymourOption[];
  // Why an option cannot be chosen now, or null.
  unavailable?: (value: string) => string | null;
  onValueChange: (value: string) => void;
}) {
  const current = options.find((option) => option.value === value);

  return (
    <DropdownMenu size="sm">
      <DropdownMenuTrigger
        variant="ghost"
        size="sm"
        aria-label={`${label}: ${optionLabel(options, value)}`}
        aria-description={current?.description}
        className="h-7 min-w-0 gap-1 rounded-full px-2.5 text-xs font-medium"
      >
        <span className="truncate">{optionLabel(options, value)}</span>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        {options.map((option) => {
          const reason = unavailable?.(option.value) ?? null;
          const selected = option.value === value;

          return (
            <DropdownMenuItem
              key={option.value}
              disabled={reason !== null}
              aria-description={reason ?? option.description}
              onSelect={() => onValueChange(option.value)}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn(selected && "font-semibold")}>
                  {option.label}
                  {selected && <span className="sr-only"> (selected)</span>}
                </span>
                <span className="text-xs text-muted-foreground">
                  {reason ?? option.description}
                </span>
              </span>

              {selected && <CheckIcon className="size-4 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
