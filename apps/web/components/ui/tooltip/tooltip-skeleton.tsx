import { cva } from "class-variance-authority";

import { SkeletonInline, type SkeletonInlineProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const tooltipSkeletonVariants = cva(
  "inline-block w-28 max-w-full rounded-md",
  {
    variants: {
      size: {
        sm: "h-(--spacing-control-sm)",
        md: "h-(--spacing-control-md)",
        lg: "h-(--spacing-control-lg)",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type TooltipSkeletonProps = SkeletonInlineProps;
export function TooltipSkeleton({
  size,
  className,
  ...props
}: TooltipSkeletonProps) {
  return (
    <SkeletonInline
      {...props}
      data-skeleton="tooltip"
      className={cn(tooltipSkeletonVariants({ size: size ?? "md" }), className)}
    />
  );
}
