import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { SkeletonInline } from "../skeleton/skeleton";
import { progressSkeletonVariants } from "./progress-skeleton";

export const progressVariants = cva(
  "block w-full min-w-0 appearance-none overflow-hidden rounded-full bg-secondary text-primary ring-1 ring-border/80 ring-inset [contain:paint] [--progress-fill:color-mix(in_oklch,var(--primary)_45%,var(--ring))] dark:[--progress-fill:var(--primary)] contrast-more:ring-input [&::-webkit-progress-bar]:h-full [&::-webkit-progress-bar]:w-full [&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:h-full [&::-webkit-progress-value]:rounded-full [&::-webkit-progress-value]:bg-(--progress-fill) [&[value]::-webkit-progress-value]:transition-[width] [&[value]::-webkit-progress-value]:duration-300 [&[value]::-webkit-progress-value]:ease-out motion-reduce:[&[value]::-webkit-progress-value]:transition-none indeterminate:[&::-webkit-progress-bar]:w-2/5 indeterminate:[&::-webkit-progress-bar]:bg-(--progress-fill) indeterminate:[&::-webkit-progress-bar]:animate-progress-indeterminate motion-reduce:indeterminate:[&::-webkit-progress-bar]:mx-auto motion-reduce:indeterminate:[&::-webkit-progress-bar]:animate-none [&::-moz-progress-bar]:h-full [&::-moz-progress-bar]:rounded-full [&::-moz-progress-bar]:bg-(--progress-fill) indeterminate:[&::-moz-progress-bar]:w-2/5 indeterminate:[&::-moz-progress-bar]:animate-progress-indeterminate motion-reduce:indeterminate:[&::-moz-progress-bar]:mx-auto motion-reduce:indeterminate:[&::-moz-progress-bar]:animate-none forced-colors:appearance-auto",
  {
    variants: {
      size: { sm: "h-1.5", md: "h-2.5", lg: "h-3.5" },
    },
    defaultVariants: { size: "md" },
  },
);

export type ProgressProps = ComponentProps<"progress"> &
  VariantProps<typeof progressVariants> & { skeleton?: boolean };

export function Progress({
  skeleton = false,
  className,
  size,
  max = 100,
  ...props
}: ProgressProps) {
  if (skeleton) {
    return (
      <SkeletonInline
        id={props.id}
        style={props.style}
        data-skeleton="progress"
        className={cn(
          progressSkeletonVariants({ size: size ?? "md" }),
          className,
        )}
      />
    );
  }

  return (
    <progress
      {...props}
      max={max}
      data-slot="progress"
      className={cn(progressVariants({ size }), className)}
    />
  );
}
