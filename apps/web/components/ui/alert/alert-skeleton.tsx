import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const alertSkeletonVariants = cva(
  "flex w-full min-w-0 items-start gap-3 rounded-lg border border-border bg-card",
  {
    variants: { size: { sm: "p-3", md: "p-4", lg: "p-5" } },
    defaultVariants: { size: "md" },
  },
);

export type AlertSkeletonProps = SkeletonProps;

export function AlertSkeleton({
  className,
  size,
  ...props
}: AlertSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="alert"
      className={cn(alertSkeletonVariants({ size: size ?? "md" }), className)}
    >
      <Skeleton className="size-4 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton size={size} className="max-w-40" />
        <Skeleton size={size} />
      </div>
    </div>
  );
}
