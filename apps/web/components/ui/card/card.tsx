import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { CardSkeleton } from "./card-skeleton";

export const cardVariants = cva(
  "flex w-full min-w-0 flex-col gap-(--card-gap) rounded-lg border border-border p-(--card-padding) text-card-foreground",
  {
    variants: {
      variant: { default: "bg-card", muted: "bg-muted" },
      size: {
        sm: "[--card-padding:1rem] [--card-gap:1rem]",
        md: "[--card-padding:1.25rem] sm:[--card-padding:1.5rem] [--card-gap:1.25rem] sm:[--card-gap:1.5rem]",
        lg: "[--card-padding:1.5rem] sm:[--card-padding:2rem] [--card-gap:1.5rem] sm:[--card-gap:2rem]",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type CardProps = ComponentProps<"div"> &
  VariantProps<typeof cardVariants> & { skeleton?: boolean };
export type CardHeaderProps = ComponentProps<"div">;
export type CardTitleProps = ComponentProps<"h3"> & {
  as?: "h2" | "h3" | "h4" | "h5" | "h6";
};
export type CardDescriptionProps = ComponentProps<"p">;
export type CardActionProps = ComponentProps<"div">;
export type CardContentProps = ComponentProps<"div">;
export type CardFooterProps = ComponentProps<"div">;

export function Card({
  skeleton = false,
  className,
  variant,
  size,
  ...props
}: CardProps) {
  if (skeleton)
    return (
      <CardSkeleton
        size={size}
        className={className}
        style={props.style}
        id={props.id}
      />
    );

  return (
    <div
      {...props}
      data-slot="card"
      className={cn(cardVariants({ variant, size }), className)}
    />
  );
}

export function CardHeader({ className, ...props }: CardHeaderProps) {
  return (
    <div
      {...props}
      data-slot="card-header"
      className={cn(
        "grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-2",
        className,
      )}
    />
  );
}

export function CardTitle({
  as: Heading = "h3",
  className,
  ...props
}: CardTitleProps) {
  return (
    <Heading
      {...props}
      data-slot="card-title"
      className={cn(
        "col-start-1 text-base leading-snug font-semibold wrap-anywhere",
        className,
      )}
    />
  );
}

export function CardDescription({ className, ...props }: CardDescriptionProps) {
  return (
    <p
      {...props}
      data-slot="card-description"
      className={cn(
        "col-start-1 text-sm leading-relaxed text-muted-foreground wrap-anywhere",
        className,
      )}
    />
  );
}

export function CardAction({ className, ...props }: CardActionProps) {
  return (
    <div
      {...props}
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-auto",
        className,
      )}
    />
  );
}

export function CardContent({ className, ...props }: CardContentProps) {
  return (
    <div
      {...props}
      data-slot="card-content"
      className={cn("min-w-0 text-sm leading-relaxed wrap-anywhere", className)}
    />
  );
}

export function CardFooter({ className, ...props }: CardFooterProps) {
  return (
    <div
      {...props}
      data-slot="card-footer"
      className={cn("flex flex-wrap items-center gap-3", className)}
    />
  );
}
