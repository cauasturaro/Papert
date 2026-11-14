"use client";

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Button } from "@/components/ui/button/button";
import { Input } from "@/components/ui/input/input";
import { Select, SelectItem } from "@/components/ui/select/select";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { LEVELS } from "@/lib/roadmap";
import type { CatalogQuery, CatalogSort } from "./community-api";

// Select items cannot use an empty value, so "any level" needs its own token.
const ALL_LEVELS = "all";

// Long enough to skip the requests between keystrokes, short enough to feel live.
const SEARCH_DELAY_MS = 300;

export type CatalogChange = (
  next: CatalogQuery,
  options?: { replace?: boolean },
) => void;

function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.closest("input, textarea, select, [role='combobox']") !== null
  );
}

/**
 * Search box (results follow typing; Enter or Search applies at once; × clears; "/" focuses it),
 * level and order; every change returns to page 1.
 */
export function CatalogFilters({
  query,
  onChange,
}: {
  query: CatalogQuery;
  onChange: CatalogChange;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(query.q);

  // The last search this box sent, and the URL search it last saw.
  const [sent, setSent] = useState(query.q);
  const [seen, setSeen] = useState(query.q);

  // Back, Forward or a link changed the search; the URL catching up with typing does not.
  if (query.q !== seen) {
    setSeen(query.q);

    if (query.q !== sent) {
      setText(query.q);
      setSent(query.q);
    }
  }

  // Typing replaces the history entry, so Back skips every intermediate search.
  const sendTyped = useEffectEvent((q: string) => {
    setSent(q);

    onChange({ ...query, q, page: 1 }, { replace: true });
  });

  useEffect(() => {
    const q = text.trim();

    if (q === sent) {
      return;
    }

    const delay = q === "" ? 0 : SEARCH_DELAY_MS;
    const timer = window.setTimeout(() => sendTyped(q), delay);

    return () => window.clearTimeout(timer);
  }, [text, sent]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      const modified = event.metaKey || event.ctrlKey || event.altKey;

      if (event.key !== "/" || modified || isEditable(event.target)) {
        return;
      }

      event.preventDefault();

      input.current?.focus();
    }

    window.addEventListener("keydown", focusSearch);

    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function apply(next: Partial<CatalogQuery>) {
    const q = text.trim();

    setSent(q);

    onChange({ ...query, q, ...next, page: 1 });
  }

  function submit(event: FormEvent) {
    event.preventDefault();

    apply({});
  }

  function clear() {
    setText("");
    setSent("");

    onChange({ ...query, q: "", page: 1 });

    input.current?.focus();
  }

  function changeLevel(value: string) {
    const level = value === ALL_LEVELS ? "" : (value as CatalogQuery["level"]);

    apply({ level });
  }

  function changeSort(value: string) {
    apply({ sort: value as CatalogSort });
  }

  return (
    <form
      role="search"
      aria-label="Search community roadmaps"
      onSubmit={submit}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <div className="flex gap-2 sm:flex-1">
        <div className="relative min-w-0 flex-1">
          <label htmlFor="catalog-search" className="sr-only">
            Search roadmaps
          </label>

          <Input
            ref={input}
            id="catalog-search"
            type="search"
            value={text}
            maxLength={200}
            enterKeyHint="search"
            aria-keyshortcuts="/"
            placeholder="Search by topic, stack, concept or author"
            className="pr-10 [&::-webkit-search-cancel-button]:hidden"
            onChange={(event) => setText(event.target.value)}
          />

          {text && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              iconOnly
              aria-label="Clear search"
              className="absolute top-1/2 right-1 -translate-y-1/2"
              onClick={clear}
            >
              <CloseIcon />
            </Button>
          )}
        </div>

        <Button type="submit" variant="secondary">
          <SearchIcon />
          Search
        </Button>
      </div>

      <div className="flex gap-2">
        <Select
          aria-label="Level"
          value={query.level || ALL_LEVELS}
          onValueChange={changeLevel}
          className="w-auto flex-1 sm:flex-none"
        >
          <SelectItem value={ALL_LEVELS}>All levels</SelectItem>
          {LEVELS.map((level) => (
            <SelectItem key={level.value} value={level.value}>
              {level.label}
            </SelectItem>
          ))}
        </Select>

        <Select
          aria-label="Order"
          value={query.sort}
          onValueChange={changeSort}
          className="w-auto flex-1 sm:flex-none"
        >
          <SelectItem value="top">Top rated</SelectItem>
          <SelectItem value="new">Newest</SelectItem>
        </Select>
      </div>
    </form>
  );
}
