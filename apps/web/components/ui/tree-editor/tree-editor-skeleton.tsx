import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { TreeSkeleton } from "../tree/tree-skeleton";

export const treeEditorSkeletonVariants = cva("min-w-0 space-y-3", {
  variants: { size: { sm: "text-xs", md: "text-sm", lg: "text-base" } },
  defaultVariants: { size: "md" },
});
export type TreeEditorSkeletonProps = SkeletonProps;
export function TreeEditorSkeleton({
  className,
  size,
  ...props
}: TreeEditorSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="tree-editor"
      className={cn(
        treeEditorSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    >
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-10 w-32" />
        <Skeleton className="h-10 w-24" />
      </div>
      <TreeSkeleton size={size} />
    </div>
  );
}
