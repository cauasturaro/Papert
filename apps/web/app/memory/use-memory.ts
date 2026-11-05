"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  acceptMemory,
  createMemory,
  deleteMemory,
  listMemory,
  updateMemory,
  type MemoryKind,
} from "./memory-api";
import { ITEMS_KEY } from "./memory-keys";

type Change = { id: string; kind?: MemoryKind; text?: string };

/** Durable memory shared by the memory page and the tutor panel's suggestions. */
export function useMemory() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const items = useQuery({
    queryKey: ITEMS_KEY,
    queryFn: listMemory,
    retry: false,
  });

  function settled() {
    void queryClient.invalidateQueries({ queryKey: ITEMS_KEY });
  }

  const callbacks = {
    onMutate: () => setError(null),
    onError: (failure: Error) => setError(failure.message),
    onSettled: settled,
  };

  const creating = useMutation({
    mutationFn: ({ kind, text }: { kind: MemoryKind; text: string }) =>
      createMemory(kind, text),
    ...callbacks,
  });

  const updating = useMutation({
    mutationFn: ({ id, kind, text }: Change) =>
      updateMemory(id, { kind, text }),
    ...callbacks,
  });

  const accepting = useMutation({
    mutationFn: (id: string) => acceptMemory(id),
    ...callbacks,
  });

  const removing = useMutation({
    mutationFn: (id: string) => deleteMemory(id),
    ...callbacks,
  });

  // One item at a time shows a pending state; other rows stay usable.
  const pendingId =
    (updating.isPending && updating.variables?.id) ||
    (accepting.isPending && accepting.variables) ||
    (removing.isPending && removing.variables) ||
    null;

  return {
    items,
    error,
    pendingId,
    creating: creating.isPending,
    create: (kind: MemoryKind, text: string) =>
      creating.mutateAsync({ kind, text }),
    update: (change: Change) => updating.mutateAsync(change),
    accept: (id: string) => accepting.mutateAsync(id),
    remove: (id: string) => removing.mutateAsync(id),
  };
}

export type MemoryActions = ReturnType<typeof useMemory>;
