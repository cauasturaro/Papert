import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const inputVariants = cva(
  "block w-full min-w-0 rounded-md border border-input bg-card text-base text-foreground transition-colors placeholder:text-muted-foreground enabled:hover:border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/15 focus-visible:outline-none forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/15 motion-reduce:transition-none",
  {
    variants: {
      size: {
        sm: "h-control-sm px-3 md:text-sm",
        md: "h-control-md px-4 md:text-sm",
        lg: "h-control-lg px-5",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type InputProps = Omit<ComponentProps<"input">, "size"> &
  VariantProps<typeof inputVariants>;

export function Input({
  className,
  size,
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      {...props}
      type={type}
      data-slot="input"
      className={cn(inputVariants({ size }), className)}
    />
  );
}
