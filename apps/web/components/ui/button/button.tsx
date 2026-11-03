import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { SkeletonInline } from "../skeleton/skeleton";
import { buttonSkeletonVariants } from "./button-skeleton";

export const buttonVariants = cva(
  "relative inline-flex max-w-full shrink-0 cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-md border border-transparent font-semibold leading-tight text-center wrap-anywhere transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border-primary-foreground/10 bg-primary text-primary-foreground not-disabled:hover:bg-primary/80 not-disabled:active:bg-primary/70",
        solid:
          "bg-foreground text-background not-disabled:hover:bg-foreground/90 not-disabled:active:bg-foreground/80",
        soft: "bg-primary/25 text-foreground not-disabled:hover:bg-primary/40 not-disabled:active:bg-primary/55",
        secondary:
          "border-border/60 bg-secondary text-secondary-foreground not-disabled:hover:bg-accent not-disabled:active:bg-accent/70",
        outline:
          "border-border bg-card text-foreground not-disabled:hover:bg-accent not-disabled:active:bg-accent/70",
        ghost:
          "bg-transparent text-muted-foreground not-disabled:hover:bg-accent not-disabled:hover:text-accent-foreground not-disabled:active:bg-accent/70",
        destructive:
          "bg-destructive text-destructive-foreground not-disabled:hover:bg-destructive/90 not-disabled:active:bg-destructive/80",
        "destructive-outline":
          "border-destructive/30 bg-transparent text-destructive not-disabled:hover:border-destructive/50 not-disabled:hover:bg-destructive/5 not-disabled:active:bg-destructive/10",
        link: "bg-transparent text-foreground underline-offset-4 not-disabled:hover:underline not-disabled:active:underline",
      },
      size: {
        sm: "h-control-sm px-3 text-sm [&_svg:not([class*='size-'])]:size-3.5",
        md: "h-control-md px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        lg: "h-control-lg px-5 text-base [&_svg:not([class*='size-'])]:size-4.5",
      },
      iconOnly: { true: "aspect-square p-0", false: "" },
    },
    defaultVariants: { variant: "default", size: "md", iconOnly: false },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    loading?: boolean;
    skeleton?: boolean;
  };

export function Button({
  skeleton = false,
  className,
  variant,
  size,
  iconOnly,
  loading = false,
  disabled,
  type = "button",
  children,
  ...props
}: ButtonProps) {
  if (skeleton) {
    return (
      <SkeletonInline
        id={props.id}
        style={props.style}
        data-skeleton="button"
        className={cn(
          buttonSkeletonVariants({ size: size ?? "md", iconOnly }),
          className,
        )}
      />
    );
  }

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || props["aria-busy"]}
      data-slot="button"
      data-loading={loading || undefined}
      className={cn(buttonVariants({ variant, size, iconOnly }), className)}
    >
      {loading && (
        <span
          className="absolute inset-0 flex items-center justify-center"
          aria-hidden="true"
        >
          <span className="size-4 rounded-full border-2 border-current border-r-transparent motion-safe:animate-spin" />
        </span>
      )}
      <span
        className={cn(
          "inline-flex min-w-0 items-center justify-center gap-2",
          loading && "opacity-0",
        )}
      >
        {children}
      </span>
    </button>
  );
}
