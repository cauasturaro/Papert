import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const dialogSkeletonVariants = cva(
  "w-full min-w-0 space-y-6 rounded-lg border border-border bg-card",
  {
    variants: {
      size: {
        sm: "max-w-sm p-4",
        md: "max-w-lg p-5 sm:p-6",
        lg: "max-w-[40rem] p-6 sm:p-8",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type DialogSkeletonProps = SkeletonProps;

export function DialogSkeleton({
  className,
  size,
  ...props
}: DialogSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="dialog"
      className={cn(dialogSkeletonVariants({ size: size ?? "md" }), className)}
    >
      <Skeleton size={size} className="max-w-48" />
      <div className="space-y-3">
        <Skeleton size={size} />
        <Skeleton size={size} className="w-4/5" />
        <Skeleton className="h-(--spacing-control-md) rounded-md" />
      </div>
      <div className="flex flex-wrap justify-end gap-3">
        <Skeleton className="h-(--spacing-control-sm) w-20 rounded-md" />
        <Skeleton className="h-(--spacing-control-sm) w-24 rounded-md" />
      </div>
    </div>
  );
}
