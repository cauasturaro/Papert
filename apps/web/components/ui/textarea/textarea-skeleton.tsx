import { cva } from "class-variance-authority";

import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const textareaSkeletonVariants = cva("block w-full min-w-0 rounded-md", {
  variants: {
    size: {
      sm: "h-[calc(6rem+18px)] md:h-[calc(5rem+18px)]",
      md: "h-[calc(6rem+26px)] md:h-[calc(5rem+26px)]",
      lg: "h-[calc(6rem+34px)]",
    },
  },
  defaultVariants: { size: "md" },
});

export type TextareaSkeletonProps = SkeletonProps;

export function TextareaSkeleton({
  className,
  size,
  ...props
}: TextareaSkeletonProps) {
  return (
    <Skeleton
      {...props}
      data-skeleton="textarea"
      className={cn(
        textareaSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    />
  );
}
