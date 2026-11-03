import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const selectSkeletonVariants = cva("block w-full min-w-0 rounded-md", {
  variants: {
    size: {
      sm: "h-(--spacing-control-sm)",
      md: "h-(--spacing-control-md)",
      lg: "h-(--spacing-control-lg)",
    },
  },
  defaultVariants: { size: "md" },
});

export type SelectSkeletonProps = SkeletonProps;

export function SelectSkeleton({
  className,
  size,
  ...props
}: SelectSkeletonProps) {
  return (
    <Skeleton
      {...props}
      data-skeleton="select"
      className={cn(selectSkeletonVariants({ size: size ?? "md" }), className)}
    />
  );
}
