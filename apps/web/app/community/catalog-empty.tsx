"use client";

import Link from "next/link";
import { SearchIcon, SparklesIcon, UsersIcon } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button/button";
import { Card } from "@/components/ui/card/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";

const CREATE_HREF = "/study/new";

export function CatalogEmpty({ kind }: { kind: "empty-catalog" | "no-results" }) {
  const searching = kind === "no-results";

  return (
    <Card>
      <EmptyState size="lg">
        <EmptyStateIcon>
          {searching ? <SearchIcon /> : <UsersIcon />}
        </EmptyStateIcon>

        <EmptyStateTitle>
          {searching
            ? "No roadmaps match your search"
            : "No community roadmaps yet"}
        </EmptyStateTitle>

        <EmptyStateDescription>
          {searching
            ? "Try other words or another level, or create a roadmap made for your goal."
            : "Be the first: create a roadmap for your goal and publish it."}
        </EmptyStateDescription>

        <EmptyStateActions>
          <Link href={CREATE_HREF} className={buttonVariants()}>
            <SparklesIcon />
            Create a roadmap
          </Link>
        </EmptyStateActions>
      </EmptyState>
    </Card>
  );
}
