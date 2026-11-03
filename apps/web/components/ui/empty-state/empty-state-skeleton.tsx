import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";

export const emptyStateSkeletonVariants = cva(
  "flex w-full min-w-0 flex-col items-center gap-3 p-(--empty-padding)",
  {
    variants: {
      size: {
        sm: "[--empty-padding:1rem] [--empty-icon:1.5rem]",
        md: "[--empty-padding:1.5rem] [--empty-icon:2rem]",
        lg: "[--empty-padding:2rem] [--empty-icon:2.5rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);
export type EmptyStateSkeletonProps = SkeletonProps;
export function EmptyStateSkeleton({
  size,
  className,
  ...props
}: EmptyStateSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="empty-state"
      className={cn(
        emptyStateSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    >
      <Skeleton className="size-(--empty-icon)" />
      <Skeleton size={size} className="w-40 max-w-full" />
      <Skeleton size={size} className="w-64 max-w-full" />
    </div>
  );
}
