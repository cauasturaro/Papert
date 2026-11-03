"use client";

import type { ComponentType } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu/dropdown-menu";
import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "@/components/icons";
import type { ThemePreference } from "@/lib/theme";
import { useTheme } from "./use-theme";

const options: {
  value: ThemePreference;
  label: string;
  Icon: ComponentType<{ className?: string }>;
}[] = [
  { value: "system", label: "System", Icon: MonitorIcon },
  { value: "light", label: "Light", Icon: SunIcon },
  { value: "dark", label: "Dark", Icon: MoonIcon },
];

export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const TriggerIcon = resolved === "dark" ? MoonIcon : SunIcon;
  const current = options.find((option) => option.value === preference);

  return (
    <DropdownMenu size="sm">
      <DropdownMenuTrigger
        variant="ghost"
        iconOnly
        aria-label={`Theme: ${current?.label ?? "System"}`}
      >
        <TriggerIcon />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>

        {options.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setPreference(value)}
            aria-current={value === preference ? "true" : undefined}
          >
            <Icon className="size-4" />
            <span className="flex-1">{label}</span>
            {value === preference && <CheckIcon className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
