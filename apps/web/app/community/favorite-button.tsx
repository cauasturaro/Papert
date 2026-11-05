"use client";

import { Button } from "@/components/ui/button/button";
import { BookmarkIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

/**
 * Saves a reference in the learner's library; the roadmap itself is never copied. The visible
 * label already states the saved state, so the button is not a toggle with aria-pressed.
 */
export function FavoriteButton({
  favorited,
  disabled,
  onToggle,
}: {
  favorited: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <Button variant="outline" size="sm" disabled={disabled} onClick={onToggle}>
      <BookmarkIcon className={cn(favorited && "fill-current text-ring")} />
      {favorited ? "Saved" : "Save"}
    </Button>
  );
}
