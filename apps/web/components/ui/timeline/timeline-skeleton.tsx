import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";

export const timelineSkeletonVariants = cva("w-full min-w-0 space-y-4", {
  variants: {
    size: {
      sm: "[--timeline-marker:1.5rem]",
      md: "[--timeline-marker:2rem]",
      lg: "[--timeline-marker:2.5rem]",
    },
  },
  defaultVariants: { size: "md" },
});
export type TimelineSkeletonProps = SkeletonProps;
export function TimelineSkeleton({
  size,
  className,
  ...props
}: TimelineSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="timeline"
      className={cn(
        timelineSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    >
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex min-w-0 gap-3">
          <Skeleton className="size-(--timeline-marker) shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton size={size} className="w-2/3" />
            <Skeleton size="sm" className="w-1/3" />
            <Skeleton size={size} />
          </div>
        </div>
      ))}
    </div>
  );
}
