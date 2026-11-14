"use client";

import { Card } from "@/components/ui/card/card";

export function HomeSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading your roadmaps"
      className="space-y-4"
    >
      <Card skeleton className="h-40" />
      <Card skeleton className="h-56" />
    </div>
  );
}
