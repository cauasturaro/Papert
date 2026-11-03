import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const badgeSkeletonVariants = cva(
  "inline-block w-20 max-w-full rounded-sm",
  {
    variants: {
      size: {
        sm: "h-[calc(1rem+6px)]",
        md: "h-[calc(1rem+10px)]",
        lg: "h-[calc(1.25rem+14px)]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type BadgeSkeletonProps = SkeletonProps;

export function BadgeSkeleton({
  className,
  size,
  ...props
}: BadgeSkeletonProps) {
  return (
    <Skeleton
      {...props}
      data-skeleton="badge"
      className={cn(badgeSkeletonVariants({ size: size ?? "md" }), className)}
    />
  );
}
