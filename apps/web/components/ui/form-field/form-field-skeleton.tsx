import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Skeleton, type SkeletonProps } from "../skeleton/skeleton";

export const formFieldSkeletonVariants = cva(
  "grid w-full min-w-0 grid-cols-1 gap-2",
  {
    variants: {
      size: {
        sm: "[--field-control:2rem]",
        md: "[--field-control:2.5rem]",
        lg: "[--field-control:3rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);
export type FormFieldSkeletonProps = SkeletonProps;

export function FormFieldSkeleton({
  size,
  className,
  ...props
}: FormFieldSkeletonProps) {
  return (
    <div
      {...props}
      inert
      aria-hidden="true"
      data-skeleton="form-field"
      className={cn(
        formFieldSkeletonVariants({ size: size ?? "md" }),
        className,
      )}
    >
      <Skeleton size={size} className="w-24 max-w-full" />
      <Skeleton className="h-(--field-control) rounded-md" />
      <Skeleton size={size} className="w-48 max-w-full" />
    </div>
  );
}
