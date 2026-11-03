import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const inputSkeletonVariants = cva("block w-full min-w-0 rounded-md", {
  variants: {
    size: {
      sm: "h-(--spacing-control-sm)",
      md: "h-(--spacing-control-md)",
      lg: "h-(--spacing-control-lg)",
    },
  },
  defaultVariants: { size: "md" },
});

export type InputSkeletonProps = SkeletonProps;

export function InputSkeleton({
  className,
  size,
  ...props
}: InputSkeletonProps) {
  return (
    <Skeleton
      {...props}
      data-skeleton="input"
      className={cn(inputSkeletonVariants({ size: size ?? "md" }), className)}
    />
  );
}
