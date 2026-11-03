import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const accordionSkeletonVariants = cva("w-full min-w-0", {
  variants: {
    size: {
      sm: "[--accordion-skeleton-padding:0.75rem] [--accordion-skeleton-line:1.25rem]",
      md: "[--accordion-skeleton-padding:1rem] [--accordion-skeleton-line:1.25rem]",
      lg: "[--accordion-skeleton-padding:1.25rem] [--accordion-skeleton-line:1.5rem]",
    },
  },
  defaultVariants: { size: "md" },
});

export type AccordionSkeletonProps = SkeletonProps;

export function AccordionSkeleton({
  className,
  size,
  ...props
}: AccordionSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="accordion"
      className={cn(
        accordionSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    >
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="flex items-center justify-between gap-4 border-b border-border py-(--accordion-skeleton-padding)"
        >
          <Skeleton
            size={size}
            className="h-(--accordion-skeleton-line) max-w-64"
          />
          <Skeleton className="size-4 shrink-0" />
        </div>
      ))}
    </div>
  );
}
