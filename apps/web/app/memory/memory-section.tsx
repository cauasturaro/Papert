"use client";

import type { MemoryItem } from "./memory-api";
import { MemoryItemRow } from "./memory-item-row";
import { useMemory } from "./use-memory";

export function MemorySection({
  title,
  description,
  empty,
  items,
  actions,
  onDelete,
}: {
  title: string;
  description: string;
  empty?: string;
  items: MemoryItem[];
  actions: ReturnType<typeof useMemory>;
  onDelete: (item: MemoryItem) => void;
}) {
  return (
    <section aria-label={title} className="space-y-2">
      <div className="space-y-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      {items.length === 0 && empty && (
        <p className="text-sm text-muted-foreground">{empty}</p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <MemoryItemRow
              key={item.id}
              item={item}
              actions={actions}
              onDelete={onDelete}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
