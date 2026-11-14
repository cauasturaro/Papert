"use client";

import { CloseIcon, FileIcon } from "@/components/icons";
import { Button } from "@/components/ui/button/button";
import type { LocalUpload } from "./use-sources";

type UploadRowProps = {
  upload: LocalUpload;
  onDismiss: () => void;
  onRetry?: () => void;
};

export function UploadRow({ upload, onDismiss, onRetry }: UploadRowProps) {
  return (
    <div
      role={upload.error ? "alert" : "status"}
      className="flex items-start gap-2 rounded-md border border-border p-2"
    >
      <FileIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1 space-y-1">
        <p className="truncate font-medium" title={upload.filename}>
          {upload.filename}
        </p>

        {upload.error ? (
          <p className="text-xs text-destructive">{upload.error}</p>
        ) : (
          <p className="text-xs text-muted-foreground">Registering…</p>
        )}

        {upload.error && upload.file && onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            Retry upload
          </Button>
        )}
      </div>

      {upload.error && (
        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={`Dismiss ${upload.filename}`}
          onClick={onDismiss}
        >
          <CloseIcon />
        </Button>
      )}
    </div>
  );
}
