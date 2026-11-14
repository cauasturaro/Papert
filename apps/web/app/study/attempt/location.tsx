"use client";

import { useWorkspaceCommands } from "../workspace/workspace-commands-context";
import type { OpenLocation } from "./feedback-actions";

function LocationLabel({ path, line }: { path: string; line?: number | null }) {
  return (
    <span className="font-mono">
      {path}
      {line ? `:${line}` : ""}
    </span>
  );
}

/** A file location: a button that opens the file when the workspace can, plain text otherwise. */
export function Location({
  path,
  line,
  onOpenLocation,
}: {
  path: string;
  line?: number | null;
  onOpenLocation?: OpenLocation;
}) {
  const commands = useWorkspaceCommands();
  const openLocation = onOpenLocation ?? commands.onOpenLocation;

  if (!openLocation) {
    return <LocationLabel path={path} line={line} />;
  }

  const label = line ? `Open ${path} at line ${line}` : `Open ${path}`;

  return (
    <button
      type="button"
      className="rounded-sm text-left underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      aria-label={label}
      onClick={() => openLocation(path, line ?? undefined)}
    >
      <LocationLabel path={path} line={line} />
    </button>
  );
}
