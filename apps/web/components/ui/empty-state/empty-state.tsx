import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { EmptyStateSkeleton } from "./empty-state-skeleton";

export const emptyStateVariants = cva(
  "flex w-full min-w-0 flex-col items-center gap-3 p-(--empty-padding) text-center wrap-anywhere",
  {
    variants: {
      size: {
        sm: "[--empty-padding:1rem] [--empty-icon:1.5rem] [--empty-title:0.875rem] [--empty-description:0.75rem]",
        md: "[--empty-padding:1.5rem] [--empty-icon:2rem] [--empty-title:1rem] [--empty-description:0.875rem]",
        lg: "[--empty-padding:2rem] [--empty-icon:2.5rem] [--empty-title:1.125rem] [--empty-description:1rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);
export type EmptyStateProps = ComponentProps<"div"> &
  VariantProps<typeof emptyStateVariants> & { skeleton?: boolean };
export type EmptyStateIconProps = ComponentProps<"span">;
export type EmptyStateTitleProps = ComponentProps<"h3"> & {
  as?: "h2" | "h3" | "h4" | "h5" | "h6";
};
export type EmptyStateDescriptionProps = ComponentProps<"p">;
export type EmptyStateActionsProps = ComponentProps<"div">;

export function EmptyState({
  skeleton = false,
  size,
  className,
  ...props
}: EmptyStateProps) {
  if (skeleton)
    return (
      <EmptyStateSkeleton
        size={size}
        className={className}
        id={props.id}
        style={props.style}
      />
    );
  return (
    <div
      {...props}
      data-slot="empty-state"
      className={cn(emptyStateVariants({ size: size ?? "md" }), className)}
    />
  );
}
export function EmptyStateIcon({ className, ...props }: EmptyStateIconProps) {
  return (
    <span
      {...props}
      aria-hidden="true"
      data-slot="empty-state-icon"
      className={cn(
        "flex size-(--empty-icon,2rem) shrink-0 items-center justify-center text-muted-foreground [&>svg]:size-full",
        className,
      )}
    />
  );
}
export function EmptyStateTitle({
  as: Heading = "h3",
  className,
  ...props
}: EmptyStateTitleProps) {
  return (
    <Heading
      {...props}
      data-slot="empty-state-title"
      className={cn(
        "max-w-full text-(length:--empty-title,1rem) leading-snug font-semibold",
        className,
      )}
    />
  );
}
export function EmptyStateDescription({
  className,
  ...props
}: EmptyStateDescriptionProps) {
  return (
    <p
      {...props}
      data-slot="empty-state-description"
      className={cn(
        "max-w-md text-(length:--empty-description,0.875rem) leading-relaxed text-muted-foreground",
        className,
      )}
    />
  );
}
export function EmptyStateActions({
  className,
  ...props
}: EmptyStateActionsProps) {
  return (
    <div
      {...props}
      data-slot="empty-state-actions"
      className={cn(
        "flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2",
        className,
      )}
    />
  );
}
