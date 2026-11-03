import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const buttonSkeletonVariants = cva(
  "inline-block w-28 max-w-full shrink-0 rounded-md",
  {
    variants: {
      size: {
        sm: "h-(--spacing-control-sm)",
        md: "h-(--spacing-control-md)",
        lg: "h-(--spacing-control-lg)",
      },
      iconOnly: { true: "aspect-square w-auto", false: "" },
    },
    defaultVariants: { size: "md", iconOnly: false },
  },
);

export type ButtonSkeletonProps = SkeletonProps & { iconOnly?: boolean };

export function ButtonSkeleton({
  className,
  size,
  iconOnly,
  ...props
}: ButtonSkeletonProps) {
  return (
    <Skeleton
      {...props}
      data-skeleton="button"
      className={cn(
        buttonSkeletonVariants({ size: size ?? "md", iconOnly }),
        className,
      )}
    />
  );
}
