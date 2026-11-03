import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { SkeletonInline } from "../skeleton/skeleton";
import { textareaSkeletonVariants } from "./textarea-skeleton";

export const textareaVariants = cva(
  "block w-full min-w-0 resize-y rounded-md border border-border bg-card text-base text-foreground transition-colors placeholder:text-muted-foreground enabled:hover:border-input/40 contrast-more:border-input contrast-more:enabled:hover:border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/15 focus-visible:outline-none forced-colors:focus-visible:outline-solid forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/15 motion-reduce:transition-none",
  {
    variants: {
      size: {
        sm: "px-3 py-2 md:text-sm",
        md: "px-4 py-3 md:text-sm",
        lg: "px-5 py-4",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type TextareaProps = ComponentProps<"textarea"> &
  VariantProps<typeof textareaVariants> & { skeleton?: boolean };

export function Textarea({
  skeleton = false,
  className,
  size,
  rows = 4,
  ...props
}: TextareaProps) {
  if (skeleton) {
    return (
      <SkeletonInline
        id={props.id}
        style={props.style}
        data-skeleton="textarea"
        className={cn(
          textareaSkeletonVariants({ size: size ?? "md" }),
          className,
        )}
      />
    );
  }

  return (
    <textarea
      {...props}
      rows={rows}
      data-slot="textarea"
      className={cn(textareaVariants({ size }), className)}
    />
  );
}
