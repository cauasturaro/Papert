import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { SkeletonInline } from "../skeleton/skeleton";
import { badgeSkeletonVariants } from "./badge-skeleton";

export const badgeVariants = cva(
  "inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-sm border font-medium whitespace-normal wrap-anywhere [&>svg]:size-[1em] [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "border-border bg-card text-card-foreground",
        success: "border-success/40 bg-card text-success",
        destructive: "border-destructive/40 bg-card text-destructive",
      },
      size: {
        sm: "px-2 py-0.5 text-xs",
        md: "px-2.5 py-1 text-xs",
        lg: "px-3 py-1.5 text-sm",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type BadgeProps = ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { skeleton?: boolean };

export function Badge({
  skeleton = false,
  className,
  variant,
  size,
  ...props
}: BadgeProps) {
  if (skeleton) {
    return (
      <SkeletonInline
        id={props.id}
        style={props.style}
        data-skeleton="badge"
        className={cn(badgeSkeletonVariants({ size: size ?? "md" }), className)}
      />
    );
  }

  return (
    <span
      {...props}
      data-slot="badge"
      className={cn(badgeVariants({ variant, size }), className)}
    />
  );
}
