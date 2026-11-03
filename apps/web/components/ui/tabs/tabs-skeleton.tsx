import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const tabsSkeletonVariants = cva("w-full min-w-0 space-y-4", {
  variants: {
    size: {
      sm: "[--tab-skeleton-height:2rem]",
      md: "[--tab-skeleton-height:2.5rem]",
      lg: "[--tab-skeleton-height:3rem]",
    },
  },
  defaultVariants: { size: "md" },
});

export type TabsSkeletonProps = SkeletonProps;

export function TabsSkeleton({ className, size, ...props }: TabsSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="tabs"
      className={cn(tabsSkeletonVariants({ size: size ?? "md" }), className)}
    >
      <div className="flex w-fit max-w-full gap-1 overflow-hidden rounded-md bg-muted p-1">
        {[0, 1, 2].map((tab) => (
          <Skeleton
            key={tab}
            className="h-(--tab-skeleton-height) w-20 min-w-0 rounded-sm"
          />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton size={size} />
        <Skeleton size={size} className="w-4/5" />
      </div>
    </div>
  );
}
