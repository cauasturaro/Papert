import { cva } from "class-variance-authority";
import { SkeletonInline, type SkeletonInlineProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const dropdownMenuSkeletonVariants = cva(
  "inline-block w-28 max-w-full rounded-md",
  {
    variants: {
      size: { sm: "h-control-sm", md: "h-control-md", lg: "h-control-lg" },
    },
    defaultVariants: { size: "md" },
  },
);
export type DropdownMenuSkeletonProps = SkeletonInlineProps;
export function DropdownMenuSkeleton({
  size,
  className,
  ...props
}: DropdownMenuSkeletonProps) {
  return (
    <SkeletonInline
      {...props}
      data-skeleton="dropdown-menu"
      className={cn(
        dropdownMenuSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    />
  );
}
