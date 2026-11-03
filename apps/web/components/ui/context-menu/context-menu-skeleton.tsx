import { cva } from "class-variance-authority";
import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const contextMenuSkeletonVariants = cva(
  "w-48 max-w-full space-y-1.5 rounded-md border border-border bg-popover p-1.5 shadow-md",
  {
    variants: {
      size: {
        sm: "[--context-item-height:1.75rem]",
        md: "[--context-item-height:2.25rem]",
        lg: "[--context-item-height:2.75rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type ContextMenuSkeletonProps = SkeletonProps;

export function ContextMenuSkeleton({
  size = "md",
  className,
  ...props
}: ContextMenuSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="context-menu"
      className={cn(
        contextMenuSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    >
      <Skeleton className="h-(--context-item-height) w-full rounded-sm" />
      <Skeleton className="h-(--context-item-height) w-4/5 rounded-sm" />
      <div className="my-1 h-px bg-border" />
      <Skeleton className="h-(--context-item-height) w-3/4 rounded-sm" />
    </div>
  );
}
