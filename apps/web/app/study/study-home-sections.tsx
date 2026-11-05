"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { Card } from "@/components/ui/card/card";
import {
  EmptyState,
  EmptyStateActions,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/ui/empty-state/empty-state";
import {
  BookmarkIcon,
  RouteIcon,
  SparklesIcon,
  UsersIcon,
} from "@/components/icons";

const DISCOVER = [
  {
    href: "/community",
    title: "Explore community roadmaps",
    description: "Search roadmaps published by learners and Papert.",
    Icon: UsersIcon,
  },
  {
    href: "/library",
    title: "Your library",
    description: "Roadmaps you saved from the community.",
    Icon: BookmarkIcon,
  },
];

export function Discover() {
  return (
    <nav aria-label="Discover roadmaps" className="grid gap-3 sm:grid-cols-2">
      {DISCOVER.map(({ href, title, description, Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <Icon className="mt-0.5 size-5 text-muted-foreground" />
          <span className="space-y-0.5">
            <span className="block font-medium">{title}</span>
            <span className="block text-sm text-muted-foreground">
              {description}
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

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
