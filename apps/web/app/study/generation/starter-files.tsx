"use client";

import { FileIcon } from "@/components/icons";

export function StarterFiles({ paths }: { paths: string[] }) {
  if (paths.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium">Starter files</h3>

      <ul className="space-y-1">
        {paths.map((path) => (
          <li key={path} className="flex items-center gap-2 font-mono text-xs">
            <FileIcon className="size-4 text-muted-foreground" />
            {path}
          </li>
        ))}
      </ul>
    </div>
  );
}
