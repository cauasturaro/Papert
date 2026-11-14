"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type SetStateAction,
} from "react";

const DRAFT_PREFIX = "papert:seymour-draft";

function draftKey(workspaceId: string, conversationId: string | null) {
  return `${DRAFT_PREFIX}:${workspaceId}:${conversationId ?? "new"}`;
}

function readDraft(key: string) {
  try {
    return window.localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeDraft(key: string, text: string) {
  try {
    if (text) {
      window.localStorage.setItem(key, text);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Private mode or a full storage only loses draft recovery.
  }
}

export function useConversationDraft(workspaceId: string, conversationId: string | null | undefined) {
  const key = conversationId === undefined ? null : draftKey(workspaceId, conversationId);
  const [draft, setDraft] = useState<{ key: string | null; text: string }>({ key: null, text: "" });
  const latestDraftRef = useRef(draft);
  const adoptedKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    latestDraftRef.current = draft;
  }, [draft]);

  const adoptDraft = useCallback((id: string) => {
    adoptedKeyRef.current = draftKey(workspaceId, id);
  }, [workspaceId]);

  const pending = useRef<{ key: string; text: string; timer: ReturnType<typeof setTimeout> } | null>(null);

  const flush = useCallback(() => {
    const update = pending.current;

    if (!update) {
      return;
    }

    clearTimeout(update.timer);
    writeDraft(update.key, update.text);
    pending.current = null;
  }, []);

  useEffect(() => {
    if (key === null) {
      return;
    }

    const adopted = adoptedKeyRef.current === key;
    const text = adopted ? latestDraftRef.current.text : readDraft(key);

    adoptedKeyRef.current = null;

    // Storage is only available after hydration.
    setDraft({ key, text });

    return flush;
  }, [key, flush]);

  const setPrompt = useCallback((value: SetStateAction<string>) => {
    setDraft((current) => ({
      key,
      text: typeof value === "function" ? value(current.key === key ? current.text : "") : value,
    }));
  }, [key]);

  useEffect(() => {
    if (!key || draft.key !== key) {
      return;
    }

    const previous = pending.current;

    if (previous) {
      clearTimeout(previous.timer);
    }

    pending.current = { key, text: draft.text, timer: setTimeout(flush, 300) };
  }, [key, draft, flush]);

  return { prompt: draft.key === key ? draft.text : "", setPrompt, adoptDraft };
}
