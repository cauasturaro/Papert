"use client";

import Link from "next/link";
import { RouteIcon, SparklesIcon } from "@/components/icons";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { Card } from "@/components/ui/card/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";

export function NoRoadmaps({ onCreate }: { onCreate: () => void }) {
  return (
    <Card>
      <EmptyState size="lg">
        <EmptyStateIcon>
          <RouteIcon />
        </EmptyStateIcon>
        <EmptyStateTitle>No roadmaps yet</EmptyStateTitle>
        <EmptyStateDescription>
          Start a community roadmap or create one for your own goal. Each
          roadmap gets a private workspace.
        </EmptyStateDescription>
        <EmptyStateActions>
          <Link
            href="/community"
            className={buttonVariants({ variant: "outline" })}
          >
            Explore community roadmaps
          </Link>
          <Button onClick={onCreate}>
            <SparklesIcon />
            Create a roadmap
          </Button>
        </EmptyStateActions>
      </EmptyState>
    </Card>
  );
}
