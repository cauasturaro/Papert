import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { FormFieldSkeleton } from "./form-field-skeleton";

export const formFieldVariants = cva(
  "grid w-full min-w-0 grid-cols-1 gap-2 wrap-anywhere",
  {
    variants: {
      size: {
        sm: "[--field-label:0.875rem] [--field-description:0.75rem]",
        md: "[--field-label:0.875rem] [--field-description:0.875rem]",
        lg: "[--field-label:1rem] [--field-description:0.875rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);
export type FormFieldProps = ComponentProps<"div"> &
  VariantProps<typeof formFieldVariants> & { skeleton?: boolean };
export type FormLabelProps = ComponentProps<"label">;
export type FormDescriptionProps = ComponentProps<"p">;
export type FormMessageProps = ComponentProps<"p">;

export function FormField({
  skeleton = false,
  size,
  className,
  ...props
}: FormFieldProps) {
  if (skeleton)
    return (
      <FormFieldSkeleton
        size={size}
        className={className}
        id={props.id}
        style={props.style}
      />
    );
  return (
    <div
      {...props}
      data-slot="form-field"
      className={cn(formFieldVariants({ size: size ?? "md" }), className)}
    />
  );
}

export function FormLabel({ className, ...props }: FormLabelProps) {
  return (
    <label
      {...props}
      data-slot="form-label"
      className={cn(
        "text-(length:--field-label,0.875rem) leading-snug font-medium",
        className,
      )}
    />
  );
}

export function FormDescription({ className, ...props }: FormDescriptionProps) {
  return (
    <p
      {...props}
      data-slot="form-description"
      className={cn(
        "text-(length:--field-description,0.875rem) leading-relaxed text-muted-foreground",
        className,
      )}
    />
  );
}

export function FormMessage({ className, ...props }: FormMessageProps) {
  return (
    <p
      {...props}
      data-slot="form-message"
      className={cn(
        "text-(length:--field-description,0.875rem) leading-relaxed text-destructive",
        className,
      )}
    />
  );
}
