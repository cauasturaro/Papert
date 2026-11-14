"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { SeymourActions } from "./use-seymour";

const BOTTOM_SLACK_PX = 48;

export function useTranscriptScroll(seymour: SeymourActions) {
  // Stick to the bottom while the learner is there; otherwise offer a jump.
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const [unseen, setUnseen] = useState(false);
  const latest = seymour.execution;
  // Earlier turns added at the top do not count as new content.
  const contentKey = `${latest?.id}:${latest?.sequence}:${latest?.status}`;

  const scrollToEnd = useCallback(() => {
    const element = scroller.current;

    if (!element) {
      return;
    }

    element.scrollTop = element.scrollHeight;
    atBottom.current = true;
    setUnseen(false);
  }, []);

  // A new request or another conversation always scrolls to its end.
  const shownLatestId = useRef<string | undefined>(undefined);

  useLayoutEffect(() => {
    const newTurn = shownLatestId.current !== latest?.id;

    shownLatestId.current = latest?.id;

    if (newTurn || atBottom.current) {
      scrollToEnd();
    } else {
      setUnseen(true);
    }
  }, [contentKey, latest?.id, scrollToEnd]);

  // Loading earlier turns keeps the learner's place in the transcript.
  const distanceFromEnd = useRef<number | null>(null);

  async function loadEarlier() {
    const element = scroller.current;

    distanceFromEnd.current = element
      ? element.scrollHeight - element.scrollTop
      : null;

    await seymour.loadEarlier();

    // Nothing was added (or it failed): later turns must not restore this position.
    requestAnimationFrame(() => {
      distanceFromEnd.current = null;
    });
  }

  const historyLength = seymour.history.length;

  useLayoutEffect(() => {
    const element = scroller.current;
    const distance = distanceFromEnd.current;

    if (!element || distance === null) {
      return;
    }

    distanceFromEnd.current = null;
    element.scrollTop = element.scrollHeight - distance;
  }, [historyLength]);

  function trackScroll() {
    const element = scroller.current;

    if (!element) {
      return;
    }

    const distance =
      element.scrollHeight - element.scrollTop - element.clientHeight;

    atBottom.current = distance <= BOTTOM_SLACK_PX;

    if (atBottom.current) {
      setUnseen(false);
    }
  }

  return { scroller, unseen, scrollToEnd, loadEarlier, trackScroll };
}
