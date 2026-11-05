"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listConversations, startConversation } from "../../memory/memory-api";
import { conversationsKey } from "../../memory/memory-keys";

/**
 * The tutor conversations of a workspace and the one the panel shows. Until the learner picks
 * one, the most recently active conversation is current; `null` means none exists yet.
 */
export function useConversations(workspaceId: string) {
  const queryClient = useQueryClient();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const key = conversationsKey(workspaceId);

  const conversations = useQuery({
    queryKey: key,
    queryFn: () => listConversations(workspaceId),
    retry: false,
  });

  const starting = useMutation({
    mutationFn: () => startConversation(workspaceId),
    onSuccess: (conversation) => {
      setChosenId(conversation.id);

      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  const list = conversations.data ?? [];
  const chosen = list.find((conversation) => conversation.id === chosenId);
  const current = chosen ?? list[0] ?? null;

  // undefined while loading, so the transcript does not flash another conversation.
  let currentId: string | null | undefined = undefined;
  if (conversations.isSuccess) {
    currentId = current?.id ?? null;
  }

  return {
    list,
    current,
    currentId,
    error: conversations.error ?? starting.error,
    starting: starting.isPending,
    select: setChosenId,
    start: () => starting.mutate(),
    // A first message creates the conversation on the server; adopt it and refresh its title.
    adopt: (conversationId: string | null) => {
      if (conversationId) {
        setChosenId(conversationId);
      }

      void queryClient.invalidateQueries({ queryKey: key });
    },
  };
}
