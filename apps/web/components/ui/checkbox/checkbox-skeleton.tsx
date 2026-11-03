import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const checkboxSkeletonVariants = cva(
  "inline-block shrink-0 rounded-xs",
  {
    variants: { size: { sm: "size-4", md: "size-5", lg: "size-6" } },
    defaultVariants: { size: "md" },
  },
);

export type CheckboxSkeletonProps = SkeletonProps;

export function CheckboxSkeleton({
  className,
  size,
  ...props
}: CheckboxSkeletonProps) {
  return (
    <Skeleton
      {...props}
      data-skeleton="checkbox"
      className={cn(
        checkboxSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    />
  );
}
