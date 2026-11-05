"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input/input";
import { Select, SelectItem } from "@/components/ui/select/select";
import { LEVELS } from "@/lib/roadmap";
import type { CatalogQuery, CatalogSort } from "./community-api";

// Select items cannot use an empty value, so "any level" needs its own token.
const ALL_LEVELS = "all";

/** Search box (submitted with Enter), level and order; every change returns to the first page. */
export function CatalogFilters({
  query,
  onChange,
}: {
  query: CatalogQuery;
  onChange: (next: CatalogQuery) => void;
}) {
  const [text, setText] = useState(query.q);

  function submit(event: FormEvent) {
    event.preventDefault();

    onChange({ ...query, q: text, page: 1 });
  }

  function changeLevel(value: string) {
    const level = value === ALL_LEVELS ? "" : (value as CatalogQuery["level"]);

    onChange({ ...query, q: text, level, page: 1 });
  }

  function changeSort(value: string) {
    const sort = value as CatalogSort;

    onChange({ ...query, q: text, sort, page: 1 });
  }

  return (
    <form
      role="search"
      aria-label="Search community roadmaps"
      onSubmit={submit}
      className="flex flex-col gap-2 sm:flex-row sm:items-center"
    >
      <label htmlFor="catalog-search" className="sr-only">
        Search roadmaps
      </label>
      <Input
        id="catalog-search"
        type="search"
        value={text}
        maxLength={200}
        enterKeyHint="search"
        placeholder="Search by topic, stack or concept"
        className="sm:flex-1"
        onChange={(event) => setText(event.target.value)}
      />

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
