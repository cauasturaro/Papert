"use client";

import { useCallback, useLayoutEffect, useMemo, useRef } from "react";

export function useConversationScope(workspaceId: string, conversationId: string | null | undefined) {
  const identity = useMemo(() => ({ workspaceId, conversationId }), [workspaceId, conversationId]);
  const currentRef = useRef<typeof identity | null>(null);

  useLayoutEffect(() => {
    currentRef.current = identity;

    return () => {
      currentRef.current = null;
    };
  }, [identity]);

  return useCallback(() => currentRef.current === identity, [identity]);
}
