"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu/dropdown-menu";
import { fontSizes, type EditorSettings } from "./editor-settings";

export function EditorSettingsMenu({
  settings,
  onSettingsChange,
  onShowShortcuts,
}: {
  settings: EditorSettings;
  onSettingsChange: (change: Partial<EditorSettings>) => void;
  onShowShortcuts: () => void;
}) {
  return (
    <DropdownMenu size="sm">
      <DropdownMenuTrigger
        variant="ghost"
        size="sm"
        className="my-1 shrink-0 text-xs"
      >
        Settings
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Font size</DropdownMenuLabel>

        <DropdownMenuRadioGroup
          value={String(settings.fontSize)}
          onValueChange={(value) =>
            onSettingsChange({ fontSize: Number(value) })
          }
        >
          {fontSizes.map((size) => (
            <DropdownMenuRadioItem
              key={size}
              value={String(size)}
            >
              <span className="flex-1">{size} px</span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuCheckboxItem
          checked={settings.wordWrap}
          onCheckedChange={(checked) => onSettingsChange({ wordWrap: checked })}
        >
          <span className="flex-1">Wrap long lines</span>
        </DropdownMenuCheckboxItem>

        <DropdownMenuCheckboxItem
          checked={settings.minimap}
          onCheckedChange={(checked) => onSettingsChange({ minimap: checked })}
        >
          <span className="flex-1">Show minimap</span>
        </DropdownMenuCheckboxItem>

        <DropdownMenuCheckboxItem
          checked={settings.plainText}
          onCheckedChange={(checked) =>
            onSettingsChange({ plainText: checked })
          }
        >
          <span className="flex-1">Plain text editor</span>
        </DropdownMenuCheckboxItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={onShowShortcuts}>
          Keyboard shortcuts
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
