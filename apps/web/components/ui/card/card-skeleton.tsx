import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const cardSkeletonVariants = cva(
  "w-full min-w-0 space-y-6 rounded-lg border border-border bg-card",
  {
    variants: { size: { sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" } },
    defaultVariants: { size: "md" },
  },
);

export type CardSkeletonProps = SkeletonProps;

export function CardSkeleton({ className, size, ...props }: CardSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="card"
      className={cn(cardSkeletonVariants({ size: size ?? "md" }), className)}
    >
      <Skeleton size={size} className="max-w-40" />
      <div className="space-y-3">
        <Skeleton size={size} />
        <Skeleton size={size} className="w-4/5" />
      </div>
      <Skeleton className="h-(--spacing-control-sm) w-24 max-w-full rounded-md" />
    </div>
  );
}
