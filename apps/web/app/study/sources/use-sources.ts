"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteSource,
  listSources,
  registerSource,
  uploadToStorage,
  type Source,
} from "./sources-api";
import { studyKeys } from "../study-keys";
import { rejectionReason } from "./source-rules";

export type LocalUpload = {
  key: string;
  filename: string;
  // Set once Core registers the file, linking progress to that source.
  sourceId: string | null;
  // Null until the file is registered; 0..1 while bytes are being sent.
  progress: number | null;
  error: string | null;
  // Kept so a failed upload can be sent again without picking the file again.
  file: File | null;
};

const POLL_MS = 2000;

function settling(sources: Source[] | undefined) {
  return (sources ?? []).some(
    (source) =>
      source.status === "processing" || source.status === "awaiting_upload",
  );
}

/**
 * Lists a workspace's sources, uploads new files directly to storage and
 * polls while Core reports pending processing.
 */
export function useSources(workspaceId: string) {
  const queryClient = useQueryClient();
  const queryKey = studyKeys.sources(workspaceId);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);

  const query = useQuery({
    queryKey,
    queryFn: () => listSources(workspaceId),
    refetchInterval: (current) =>
      settling(current.state.data) ? POLL_MS : false,
  });

  const removal = useMutation({
    mutationFn: (sourceId: string) => deleteSource(workspaceId, sourceId),
    onSuccess: (_, sourceId) => {
      queryClient.setQueryData<Source[]>(queryKey, (current) =>
        current?.filter((source) => source.id !== sourceId),
      );

      setUploads((current) =>
        current.filter((upload) => upload.sourceId !== sourceId),
      );
    },
  });

  function updateUpload(key: string, changes: Partial<LocalUpload>) {
    setUploads((current) =>
      current.map((upload) =>
        upload.key === key ? { ...upload, ...changes } : upload,
      ),
    );
  }

  async function uploadOne(file: File) {
    const key = crypto.randomUUID();
    const rejection = rejectionReason(file);

    setUploads((current) => [
      ...current,
      {
        key,
        filename: file.name,
        sourceId: null,
        progress: null,
        error: rejection,
        file: rejection ? null : file,
      },
    ]);

    if (rejection) {
      return;
    }

    try {
      const registration = await registerSource(workspaceId, file);

      // Show the registered source immediately; its status comes from Core.
      queryClient.setQueryData<Source[]>(queryKey, (current) => [
        registration.source,
        ...(current ?? []),
      ]);
      updateUpload(key, { sourceId: registration.source.id, progress: 0 });

      await uploadToStorage(registration, file, (fraction) =>
        updateUpload(key, { progress: fraction }),
      );

      setUploads((current) => current.filter((upload) => upload.key !== key));
    } catch (error) {
      updateUpload(key, {
        progress: null,
        error: error instanceof Error ? error.message : "The upload failed.",
      });
    }

    await queryClient.invalidateQueries({ queryKey });
  }

  async function upload(files: FileList | File[]) {
    // Sequential uploads keep registration order predictable for the learner.
    for (const file of Array.from(files)) {
      await uploadOne(file);
    }
  }

  function dismiss(key: string) {
    setUploads((current) => current.filter((upload) => upload.key !== key));
  }

  // Removes the half-registered source first, so it no longer counts as pending.
  async function discardStalled(upload: LocalUpload) {
    if (!upload.sourceId) {
      return;
    }

    try {
      await deleteSource(workspaceId, upload.sourceId);
    } catch {
      // Core expires unfinished uploads on its own; the retry does not depend on it.
    }

    queryClient.setQueryData<Source[]>(queryKey, (current) =>
      current?.filter((source) => source.id !== upload.sourceId),
    );
  }

  async function retry(key: string) {
    const upload = uploads.find((item) => item.key === key);

    if (!upload?.file) {
      return;
    }

    await discardStalled(upload);
    dismiss(key);

    await uploadOne(upload.file);
  }

  async function removeFailed(key: string) {
    const upload = uploads.find((item) => item.key === key);

    if (!upload) {
      return;
    }

    await discardStalled(upload);
    dismiss(key);
  }

  // Sources whose bytes never reached storage; they will not finish processing.
  const stalledSourceIds = uploads
    .filter((upload) => upload.error && upload.sourceId)
    .map((upload) => upload.sourceId as string);

  return {
    sources: query.data ?? [],
    loading: query.isPending,
    loadError: query.error?.message ?? null,
    uploads,
    upload,
    dismiss,
    retry,
    removeFailed,
    stalledSourceIds,
    remove: removal.mutateAsync,
    removing: removal.isPending ? removal.variables : null,
    removeError: removal.error?.message ?? null,
    resetRemoveError: removal.reset,
  };
}
