"use client";

import { Button } from "@/components/ui/button/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog/dialog";
import { useIsApplePlatform, useShortcuts } from "@/lib/keyboard/use-shortcuts";
import { formatShortcut } from "@/lib/keyboard/shortcut";

export type WorkspaceShortcutHandlers = {
  saveAll: () => void;
  analyze: () => void;
  toggleExplorer: () => void;
  toggleSeymour: () => void;
  focusChat: () => void;
  selectTab: (index: number) => void;
  closeTab: () => void;
  showShortcuts: () => void;
};

const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

// Listed in the "Keyboard shortcuts" dialog; the first combo is the one shown first.
const shortcutList: { combos: string[]; label: string }[] = [
  { combos: ["Mod+S"], label: "Save all changes" },
  { combos: ["Mod+Enter"], label: "Check my solution" },
  { combos: ["Mod+B"], label: "Show or hide files" },
  { combos: ["Mod+\\"], label: "Show or hide Seymour" },
  { combos: ["Mod+L"], label: "Go to the Seymour chat" },
  {
    combos: ["Mod+Shift+L"],
    label: "Ask Seymour about the selected code (in the editor)",
  },
  { combos: ["Alt+1", "Mod+1"], label: "Switch to open file 1 to 9" },
  { combos: ["Alt+W", "Mod+W"], label: "Close the current file" },
  { combos: ["Mod+/", "Shift+?"], label: "Show keyboard shortcuts" },
];

/**
 * IDE shortcuts. Most also work while typing in the editor; they listen in the capture
 * phase and stop the event so Monaco does not run its own binding for the same keys.
 * Alt+digit and Alt+W type characters on some keyboard layouts, so they only work
 * outside text fields; Mod+/ is left to Monaco's "toggle comment" while editing.
 */
export function useWorkspaceShortcuts(
  handlers: WorkspaceShortcutHandlers,
  enabled: boolean,
) {
  const claim = (action: () => void) => (event: KeyboardEvent) => {
    event.stopPropagation();
    action();
  };

  const whileEditing: Record<string, (event: KeyboardEvent) => void> = {
    "Mod+S": claim(handlers.saveAll),
    "Mod+Enter": claim(handlers.analyze),
    "Mod+B": claim(handlers.toggleExplorer),
    "Mod+\\": claim(handlers.toggleSeymour),
    "Mod+L": claim(handlers.focusChat),
    "Mod+W": claim(handlers.closeTab),
  };

  for (const [index, digit] of digits.entries()) {
    whileEditing[`Mod+${digit}`] = claim(() => handlers.selectTab(index));
  }

  const outsideEditing: Record<string, () => void> = {
    "Mod+/": handlers.showShortcuts,
    "Shift+?": handlers.showShortcuts,
    "Alt+W": handlers.closeTab,
  };

  for (const [index, digit] of digits.entries()) {
    outsideEditing[`Alt+${digit}`] = () => handlers.selectTab(index);
  }

  useShortcuts(whileEditing, { enabled, allowInEditable: true, capture: true });
  useShortcuts(outsideEditing, { enabled });
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const apple = useIsApplePlatform();

  return (
    <Dialog size="md" open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          Some browsers keep shortcuts such as closing or switching tabs for
          themselves; the alternative works everywhere.
        </DialogDescription>
      </DialogHeader>

      <DialogContent>
        <dl className="divide-y divide-border text-sm">
          {shortcutList.map(({ combos, label }) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-2"
            >
              <dt>{label}</dt>

              <dd className="flex shrink-0 gap-1.5">
                {combos.map((combo, index) => (
                  <span key={combo} className="flex items-center gap-1.5">
                    {index > 0 && (
                      <span className="text-muted-foreground">or</span>
                    )}
                    <kbd className="rounded-sm border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">
                      {formatShortcut(combo, apple)}
                    </kbd>
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Close
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
