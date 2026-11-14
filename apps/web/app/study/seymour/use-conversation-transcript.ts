"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { toLearnerMessage } from "@/lib/api/learner-error";
import { executionRequest as request } from "../execution/execution-api";
import { newerSnapshot, type Execution } from "../execution/execution-state";
import type { SeymourError } from "./use-seymour";

const TRANSCRIPT_LIMIT = 100;

export function useConversationTranscript({
  workspaceId,
  conversationId,
  reloadNonce,
  isCurrent,
  setError,
}: {
  workspaceId: string;
  conversationId: string | null | undefined;
  reloadNonce: number;
  isCurrent: () => boolean;
  setError: Dispatch<SetStateAction<SeymourError | null>>;
}) {
  const key = `${workspaceId}:${conversationId}`;
  const [shownKey, setShownKey] = useState(key);
  const [job, setJob] = useState<Execution | null>(null);
  const [history, setHistory] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(true);
  const [earliest, setEarliest] = useState<{ id: string | null; hasMore: boolean }>({ id: null, hasMore: false });
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const shownHistory = useRef(history);
  const loadedKey = useRef<string | null>(null);
  const adoptedIdRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    shownHistory.current = history;
  }, [history]);

  // A different conversation clears the transcript at once, so no old turn shows under the new title.
  useEffect(() => {
    if (conversationId === undefined) {
      return;
    }

    let disposed = false;
    const key = `${workspaceId}:${conversationId}`;

    if (conversationId && conversationId === adoptedIdRef.current) {
      loadedKey.current = key;
      adoptedIdRef.current = null;
    }

    const switched = loadedKey.current !== key;

    if (switched) {
      setJob(null);
      setHistory([]);
      setEarliest({ id: null, hasMore: false });
      setLoading(true);
      setLoadingEarlier(false);
      setError(null);
    }

    // Before the first conversation exists there is no transcript to load.
    const transcript = conversationId
      ? request<Execution[]>(
          `workspaces/${workspaceId}?conversation=${conversationId}`,
        )
      : Promise.resolve([]);

    transcript
      .then((jobs) => {
        if (disposed || !isCurrent()) {
          return;
        }

        setShownKey(key);

        // Jobs arrive newest first; only the latest one is followed live.
        const chats = jobs.filter((job) => job.kind === "chat");
        const recent = chats.slice(1).reverse();
        const page = {
          id: jobs[jobs.length - 1]?.id ?? null,
          hasMore: !!conversationId && jobs.length >= TRANSCRIPT_LIMIT,
        };

        loadedKey.current = key;
        setJob((current) => {
          const latest = chats[0] ?? null;

          if (current && latest && current.id === latest.id) {
            return newerSnapshot(current, latest);
          }

          return latest;
        });

        // A reload of the same conversation keeps the earlier turns already shown.
        const past = switched ? [] : shownHistory.current;
        const overlap =
          recent.length > 0
            ? past.findIndex((job) => job.id === recent[0].id)
            : -1;

        if (overlap > 0) {
          setHistory([...past.slice(0, overlap), ...recent]);
        } else {
          setHistory(recent);
          setEarliest(page);
        }

        setLoading(false);
      })
      .catch((failure: unknown) => {
        if (disposed || !isCurrent()) {
          return;
        }

        setShownKey(key);
        setLoading(false);
        setError({
          message: toLearnerMessage(failure),
          retry: null,
          waitUntil: null,
        });
      });

    return () => {
      disposed = true;
    };
  }, [workspaceId, conversationId, reloadNonce, isCurrent, setError]);

  /** Prepends the page of turns before the oldest one shown. */
  async function loadEarlier() {
    if (
      !isCurrent() ||
      !conversationId ||
      !earliest.id ||
      !earliest.hasMore ||
      loadingEarlier
    ) {
      return;
    }

    setLoadingEarlier(true);

    const query = new URLSearchParams({
      conversation: conversationId,
      before: earliest.id,
    });

    try {
      const jobs = await request<Execution[]>(
        `workspaces/${workspaceId}?${query}`,
      );

      if (!isCurrent()) {
        return;
      }

      const older = jobs.filter((job) => job.kind === "chat").reverse();

      setHistory((past) => {
        const known = new Set(past.map((job) => job.id));

        return [...older.filter((job) => !known.has(job.id)), ...past];
      });
      setEarliest({
        id: jobs[jobs.length - 1]?.id ?? earliest.id,
        hasMore: jobs.length >= TRANSCRIPT_LIMIT,
      });
    } catch (failure) {
      if (!isCurrent()) {
        return;
      }

      setError({
        message: toLearnerMessage(failure),
        retry: null,
        waitUntil: null,
      });
    } finally {
      if (isCurrent()) {
        setLoadingEarlier(false);
      }
    }
  }

  function adoptConversation(id: string) {
    adoptedIdRef.current = id;
    setShownKey(`${workspaceId}:${id}`);
  }

  const visible = shownKey === key;

  return {
    job: visible ? job : null,
    setJob,
    history: visible ? history : [],
    setHistory,
    loading: !visible || loading,
    earliest: visible ? earliest : { id: null, hasMore: false },
    loadingEarlier: visible && loadingEarlier,
    loadEarlier,
    adoptConversation,
  };
}
