import { cva } from "class-variance-authority";
import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";
import { cn } from "@/lib/utils";

export const alertDialogSkeletonVariants = cva(
  "w-full min-w-0 space-y-4 rounded-lg border border-border bg-card",
  {
    variants: {
      size: { sm: "max-w-sm p-4", md: "max-w-lg p-6", lg: "max-w-[40rem] p-8" },
    },
    defaultVariants: { size: "md" },
  },
);
export type AlertDialogSkeletonProps = SkeletonProps;
export function AlertDialogSkeleton({
  size,
  className,
  ...props
}: AlertDialogSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="alert-dialog"
      className={cn(
        alertDialogSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    >
      <Skeleton size={size} className="w-1/2" />
      <Skeleton size={size} />
      <Skeleton size={size} className="w-4/5" />
      <div className="flex flex-wrap justify-between gap-3 max-sm:flex-col-reverse">
        <Skeleton className="h-control-md w-24" />
        <Skeleton className="h-control-md w-24" />
      </div>
    </div>
  );
}
