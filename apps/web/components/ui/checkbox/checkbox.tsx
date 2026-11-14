import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const checkboxVariants = cva(
  "peer m-0 shrink-0 cursor-pointer touch-manipulation appearance-none border border-input bg-card transition-colors checked:border-primary-border checked:bg-primary contrast-more:checked:border-primary-foreground enabled:hover:border-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive motion-reduce:transition-none forced-colors:appearance-auto",
  {
    variants: {
      size: {
        sm: "size-4 rounded-[calc(var(--radius)/3)]",
        md: "size-5 rounded-xs",
        lg: "size-6 rounded-[calc(var(--radius)*0.5)]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type CheckboxProps = Omit<ComponentProps<"input">, "size" | "type"> &
  VariantProps<typeof checkboxVariants>;

export function Checkbox({ className, size, ...props }: CheckboxProps) {
  return (
    <span className="relative inline-flex shrink-0 align-middle">
      <input
        {...props}
        type="checkbox"
        data-slot="checkbox"
        className={cn(checkboxVariants({ size }), className)}
      />
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 hidden size-3/4 -translate-x-1/2 -translate-y-1/2 text-primary-foreground peer-checked:block peer-disabled:opacity-60 forced-colors:peer-checked:hidden"
      >
        <path d="m5 12 4 4L19 6" />
      </svg>
    </span>
  );
}
