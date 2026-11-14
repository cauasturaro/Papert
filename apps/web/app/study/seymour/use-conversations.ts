"use client";

import { useMemo, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import {
  deleteConversation,
  listConversationPage,
  renameConversation,
  startConversation,
} from "../../memory/memory-api";
import { conversationsKey } from "../../memory/memory-keys";

/**
 * The tutor conversations of a workspace and the one the panel shows. Until the learner picks
 * one, the most recently active conversation is current; `null` means none exists yet.
 */
export function useConversations(workspaceId: string) {
  const queryClient = useQueryClient();
  const [chosenId, setChosenId] = useState<string | null>(null);
  const key = conversationsKey(workspaceId);

  const conversations = useInfiniteQuery({
    queryKey: key,
    queryFn: ({ pageParam }) => listConversationPage(workspaceId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

  const list = useMemo(
    () => conversations.data?.pages.flatMap((page) => page.items) ?? [],
    [conversations.data],
  );

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: key });
  }

  // Core returns the current conversation when it has no messages yet.
  const starting = useMutation({
    mutationFn: () => startConversation(workspaceId),
    onSuccess: (conversation) => {
      setChosenId(conversation.id);
      refresh();
    },
  });

  const renaming = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      renameConversation(workspaceId, id, title),
    onSuccess: refresh,
  });

  const removing = useMutation({
    mutationFn: (id: string) => deleteConversation(workspaceId, id),
    onSuccess: (_result, id) => {
      if (id === chosenId) {
        setChosenId(null);
      }

      refresh();
    },
  });

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
    // A failed later page keeps the loaded list; it is reported as `loadMoreError`.
    error: conversations.isFetchNextPageError
      ? starting.error
      : (conversations.error ?? starting.error),
    hasMore: conversations.hasNextPage,
    loadingMore: conversations.isFetchingNextPage,
    loadMoreError: conversations.isFetchNextPageError
      ? conversations.error
      : null,
    loadMore: () => {
      if (!conversations.isFetchingNextPage) {
        void conversations.fetchNextPage();
      }
    },
    starting: starting.isPending,
    select: setChosenId,
    start: () => starting.mutate(),
    refresh,
    rename: (id: string, title: string) => renaming.mutateAsync({ id, title }),
    renaming: renaming.isPending,
    remove: (id: string) => removing.mutateAsync(id),
    removing: removing.isPending,
    // A first message creates the conversation on the server; adopt it and refresh its title.
    adopt: (conversationId: string | null) => {
      if (conversationId) {
        setChosenId(conversationId);
      }

      refresh();
    },
  };
}

export type ConversationActions = ReturnType<typeof useConversations>;
