import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const skeletonVariants = cva(
  "w-full rounded-sm border border-border bg-muted motion-safe:animate-pulse forced-colors:border-[CanvasText]",
  {
    variants: { size: { sm: "h-3", md: "h-4", lg: "h-5" } },
    defaultVariants: { size: "md" },
  },
);

export type SkeletonProps = Omit<
  ComponentProps<"div">,
  "children" | "dangerouslySetInnerHTML" | "role" | "tabIndex"
> &
  VariantProps<typeof skeletonVariants>;

export type SkeletonInlineProps = Omit<
  ComponentProps<"span">,
  "children" | "dangerouslySetInnerHTML" | "role" | "tabIndex"
> &
  VariantProps<typeof skeletonVariants>;

// Keeps control placeholders valid inside p and label elements.
export function SkeletonInline({
  className,
  size,
  ...props
}: SkeletonInlineProps) {
  return (
    <span
      {...props}
      inert
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(
        "block",
        skeletonVariants({ size: size ?? "md" }),
        className,
      )}
    />
  );
}

export function Skeleton({ className, size, ...props }: SkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-slot="skeleton"
      className={cn(skeletonVariants({ size: size ?? "md" }), className)}
    />
  );
}
