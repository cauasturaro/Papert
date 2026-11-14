"use client";

import { useWorkspaceCommands } from "../workspace/workspace-commands-context";
import { Button } from "@/components/ui/button/button";
import type { AskSeymour } from "./feedback-actions";

export function AskButton({
  prompt,
  label,
  onAskSeymour,
}: {
  prompt: string;
  label: string;
  onAskSeymour?: AskSeymour;
}) {
  const commands = useWorkspaceCommands();
  const askSeymour = onAskSeymour ?? commands.onAskSeymour;

  if (!askSeymour) {
    return null;
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 px-2 text-xs"
      aria-label={label}
      onClick={() => askSeymour(prompt)}
    >
      Ask Seymour
    </Button>
  );
}
