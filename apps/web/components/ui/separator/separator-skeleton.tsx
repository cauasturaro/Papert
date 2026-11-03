import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";

export const separatorSkeletonVariants = cva("shrink-0 rounded-none border-0", {
  variants: {
    orientation: {
      horizontal: "h-px w-full border-t",
      vertical: "h-auto w-px self-stretch border-l",
    },
    draggable: { true: "", false: "" },
  },
  compoundVariants: [
    { orientation: "horizontal", draggable: true, className: "h-6" },
    { orientation: "vertical", draggable: true, className: "w-6" },
  ],
  defaultVariants: { orientation: "horizontal", draggable: false },
});
export type SeparatorSkeletonProps = Omit<SkeletonProps, "size" | "draggable"> &
  VariantProps<typeof separatorSkeletonVariants>;

export function SeparatorSkeleton({
  orientation,
  draggable = false,
  className,
  ...props
}: SeparatorSkeletonProps) {
  return (
    <Skeleton
      {...props}
      data-skeleton="separator"
      className={cn(
        separatorSkeletonVariants({
          orientation: orientation ?? "horizontal",
          draggable,
        }),
        className,
      )}
    />
  );
}
