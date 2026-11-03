import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { AlertSkeleton } from "./alert-skeleton";

export const alertVariants = cva(
  "grid w-full min-w-0 grid-cols-[minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-lg border bg-card text-card-foreground wrap-anywhere has-[>svg]:grid-cols-[auto_minmax(0,1fr)] [&>svg]:col-start-1 [&>svg]:row-span-2 [&>svg]:row-start-1 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0 [&>svg~*]:col-start-2",
  {
    variants: {
      variant: {
        default: "border-border [&>svg]:text-muted-foreground",
        success:
          "border-success/40 [&>svg]:text-success [&>[data-slot=alert-title]]:text-success",
        destructive:
          "border-destructive/40 [&>svg]:text-destructive [&>[data-slot=alert-title]]:text-destructive",
      },
      size: {
        sm: "p-3 text-sm",
        md: "p-4 text-sm",
        lg: "p-5 text-base [&>svg]:size-5",
      },
    },
    defaultVariants: { variant: "default", size: "md" },
  },
);

export type AlertProps = ComponentProps<"div"> &
  VariantProps<typeof alertVariants> & { skeleton?: boolean };

export function Alert({
  skeleton = false,
  className,
  variant,
  size,
  ...props
}: AlertProps) {
  if (skeleton)
    return (
      <AlertSkeleton
        size={size}
        className={className}
        style={props.style}
        id={props.id}
      />
    );

  return (
    <div
      {...props}
      data-slot="alert"
      className={cn(alertVariants({ variant, size }), className)}
    />
  );
}

export type AlertTitleProps = ComponentProps<"h3">;

export function AlertTitle({ className, ...props }: AlertTitleProps) {
  return (
    <h3
      {...props}
      data-slot="alert-title"
      className={cn("font-semibold", className)}
    />
  );
}

export type AlertDescriptionProps = ComponentProps<"div">;

export function AlertDescription({
  className,
  ...props
}: AlertDescriptionProps) {
  return (
    <div
      {...props}
      data-slot="alert-description"
      className={cn(
        "min-w-0 space-y-3 leading-relaxed text-muted-foreground",
        className,
      )}
    />
  );
}
