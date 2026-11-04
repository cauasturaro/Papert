"use client";

import { Badge } from "@/components/ui/badge/badge";
import { Button } from "@/components/ui/button/button";
import { Progress } from "@/components/ui/progress/progress";
import { CloseIcon, FileIcon, TrashIcon } from "@/components/icons";
import type { Source } from "./sources-api";
import type { LocalUpload } from "./use-sources";

const statusLabels: Record<Source["status"], string> = {
  awaiting_upload: "Uploading",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

function formatSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function readySummary(source: Source) {
  const parts = [plural(source.chunkCount ?? 0, "passage")];

  if (source.pageCount) {
    parts.push(plural(source.pageCount, "page"));
  }

  return parts.join(" · ");
}

type SourceRowProps = {
  source: Source;
  upload: LocalUpload | undefined;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
};

export function SourceRow({
  source,
  upload,
  deleting,
  onOpen,
  onDelete,
}: SourceRowProps) {
  const uploading = upload?.progress !== null && upload?.progress !== undefined;
  const failed = source.status === "failed" || Boolean(upload?.error);
  const message = upload?.error ?? source.error?.message;

  let badge = (
    <Badge size="sm" variant="secondary">
      {statusLabels[source.status]}
    </Badge>
  );

  if (source.status === "ready") {
    badge = (
      <Badge size="sm" variant="success">
        Ready
      </Badge>
    );
  }

  if (failed) {
    badge = (
      <Badge size="sm" variant="destructive">
        Failed
      </Badge>
    );
  }

  return (
    <li className="rounded-md border border-border p-2">
      <div className="flex items-start gap-2">
        <FileIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

        <div className="min-w-0 flex-1 space-y-1">
          {source.status === "ready" ? (
            <button
              type="button"
              className="block max-w-full truncate text-left font-medium underline-offset-2 hover:underline focus-visible:underline"
              title={`Open ${source.filename}`}
              onClick={onOpen}
            >
              {source.filename}
            </button>
          ) : (
            <p className="truncate font-medium" title={source.filename}>
              {source.filename}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {badge}
            <span className="uppercase">{source.format}</span>
            <span>{formatSize(source.size)}</span>
            {source.status === "ready" && <span>{readySummary(source)}</span>}
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          iconOnly
          aria-label={`Delete ${source.filename}`}
          loading={deleting}
          onClick={onDelete}
        >
          <TrashIcon />
        </Button>
      </div>

      {uploading && !upload?.error && (
        <Progress
          size="sm"
          className="mt-2"
          value={Math.round((upload?.progress ?? 0) * 100)}
          max={100}
          aria-label={`Uploading ${source.filename}`}
        />
      )}

      {!uploading && source.status === "processing" && (
        <Progress
          size="sm"
          className="mt-2"
          aria-label={`Processing ${source.filename}`}
        />
      )}

      {failed && message && (
        <p className="mt-2 text-xs text-destructive">{message}</p>
      )}

      {source.status === "ready" && source.warnings.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
          {source.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

type UploadRowProps = {
  upload: LocalUpload;
  onDismiss: () => void;
};

export function UploadRow({ upload, onDismiss }: UploadRowProps) {
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
