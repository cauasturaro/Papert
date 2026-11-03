import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const progressSkeletonVariants = cva(
  "block w-full min-w-0 rounded-full",
  {
    variants: { size: { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" } },
    defaultVariants: { size: "md" },
  },
);

export type ProgressSkeletonProps = SkeletonProps;

export function ProgressSkeleton({
  className,
  size,
  ...props
}: ProgressSkeletonProps) {
  return (
    <Skeleton
      {...props}
      data-skeleton="progress"
      className={cn(
        progressSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    />
  );
}
