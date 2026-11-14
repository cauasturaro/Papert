"use client";

import { Card } from "@/components/ui/card/card";

export function CatalogSkeleton() {
  return (
    <div
      className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      aria-hidden="true"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <Card key={index} skeleton className="h-56" />
      ))}
    </div>
  );
}
