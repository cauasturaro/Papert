import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";

export const treeSkeletonVariants = cva(
  "min-w-0 space-y-2 rounded-lg border border-border bg-card p-3",
  {
    variants: {
      size: {
        sm: "[--tree-row:2rem] [--tree-indent:1rem] max-sm:[--tree-indent:0.625rem]",
        md: "[--tree-row:2.5rem] [--tree-indent:1.25rem] max-sm:[--tree-indent:0.75rem]",
        lg: "[--tree-row:3rem] [--tree-indent:1.5rem] max-sm:[--tree-indent:0.875rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);
export type TreeSkeletonProps = SkeletonProps;
export function TreeSkeleton({ size, className, ...props }: TreeSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="tree"
      className={cn(treeSkeletonVariants({ size: size ?? "md" }), className)}
    >
      {[0, 1, 1, 0, 1].map((depth, index) => (
        <div
          key={index}
          style={{
            paddingInlineStart: `calc(${depth} * var(--tree-indent, 1.25rem))`,
          }}
          className="flex h-(--tree-row) items-center gap-3"
        >
          <Skeleton className="size-4 shrink-0" />
          <Skeleton size={size} className={index % 2 ? "w-1/2" : "w-2/3"} />
        </div>
      ))}
    </div>
  );
}
