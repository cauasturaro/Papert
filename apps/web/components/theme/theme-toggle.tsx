"use client";

import type { ComponentType } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu/dropdown-menu";
import { MonitorIcon, MoonIcon, SunIcon } from "@/components/icons";
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

function isThemePreference(value: string): value is ThemePreference {
  return options.some((option) => option.value === value);
}

export function ThemeToggle() {
  const { preference, resolved, setPreference } = useTheme();
  const TriggerIcon = resolved === "dark" ? MoonIcon : SunIcon;
  const current = options.find((option) => option.value === preference);

  function choose(value: string) {
    if (isThemePreference(value)) {
      setPreference(value);
    }
  }

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

        <DropdownMenuRadioGroup value={preference} onValueChange={choose}>
          {options.map(({ value, label, Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
            >
              <Icon className="size-4" />
              <span className="flex-1">{label}</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
