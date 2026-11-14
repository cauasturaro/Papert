"use client";

import { useState, type KeyboardEvent, type RefObject } from "react";
import {
  insertMention,
  matchingTargets,
  mentionedTargets,
  openMention,
  type MentionQuery,
  type MentionTarget,
} from "./mentions";

export function mentionOptionId(index: number) {
  return `mention-option-${index}`;
}

/** State and keyboard handling for @-mentioning workspace sources and files in the composer. */
export function useMentionPicker(
  prompt: string,
  setPrompt: (prompt: string) => void,
  sources: MentionTarget[],
  textarea: RefObject<HTMLTextAreaElement | null>,
) {
  const [mention, setMention] = useState<MentionQuery | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const options = mention ? matchingTargets(sources, mention.query) : [];
  const open = mention !== null;
  const mentioned = mentionedTargets(prompt, sources);

  function track(text: string, caret: number) {
    const current = openMention(text, caret, sources);

    setMention(current);

    if (current?.query !== mention?.query) {
      setHighlighted(0);
    }
  }

  function choose(source: MentionTarget) {
    const field = textarea.current;

    if (!mention || !field) {
      return;
    }

    const inserted = insertMention(
      prompt,
      mention,
      field.selectionStart,
      source.filename,
    );

    setPrompt(inserted.text);
    setMention(null);

    // Restore the caret after React applies the new value.
    requestAnimationFrame(() => {
      field.focus();
      field.setSelectionRange(inserted.caret, inserted.caret);
    });
  }

  /** While the menu is open, arrows move, Enter/Tab choose and Escape closes. */
  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!open || event.nativeEvent.isComposing) {
      return false;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setMention(null);

      return true;
    }

    if (options.length === 0) {
      return false;
    }

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();

      const step = event.key === "ArrowDown" ? 1 : -1;
      setHighlighted(
        (index) => (index + step + options.length) % options.length,
      );

      return true;
    }

    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      choose(options[highlighted] ?? options[0]);

      return true;
    }

    return false;
  }

  return {
    open,
    options,
    highlighted,
    mentioned,
    activeOptionId:
      open && options.length > 0 ? mentionOptionId(highlighted) : undefined,
    track,
    choose,
    close: () => setMention(null),
    handleKey,
  };
}
