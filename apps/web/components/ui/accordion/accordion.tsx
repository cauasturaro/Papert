"use client";

import { useState, type ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { AccordionSkeleton } from "./accordion-skeleton";

export type AccordionProps = ComponentProps<"div"> & {
  skeleton?: boolean;
  size?: "sm" | "md" | "lg" | null;
};

export function Accordion({
  skeleton = false,
  size,
  className,
  ...props
}: AccordionProps) {
  if (skeleton)
    return (
      <AccordionSkeleton
        size={size}
        className={className}
        style={props.style}
        id={props.id}
      />
    );

  return (
    <div
      {...props}
      data-slot="accordion"
      className={cn("w-full min-w-0", className)}
    />
  );
}

export type AccordionItemProps = Omit<ComponentProps<"details">, "name"> & {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function AccordionItem({
  open,
  defaultOpen = false,
  onOpenChange,
  onToggle,
  className,
  ...props
}: AccordionItemProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  return (
    <details
      {...props}
      open={isOpen}
      data-slot="accordion-item"
      className={cn("min-w-0 border-b border-border", className)}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;
        onToggle?.(event);
        // Prop changes also emit toggle; only a native change requests new state.
        if (nextOpen === isOpen) return;
        if (open === undefined) setInternalOpen(nextOpen);
        else event.currentTarget.open = isOpen;
        onOpenChange?.(nextOpen);
      }}
    />
  );
}

export const accordionTriggerVariants = cva(
  "flex min-w-0 cursor-pointer touch-manipulation list-none items-start justify-between gap-4 rounded-sm text-left font-medium text-foreground transition-colors hover:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none [&::-webkit-details-marker]:hidden [[open]>&>svg]:rotate-180",
  {
    variants: {
      size: {
        sm: "py-3 text-sm",
        md: "py-4 text-sm",
        lg: "py-5 text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type AccordionTriggerProps = ComponentProps<"summary"> &
  VariantProps<typeof accordionTriggerVariants>;

export function AccordionTrigger({
  className,
  size,
  children,
  ...props
}: AccordionTriggerProps) {
  return (
    <summary
      {...props}
      data-slot="accordion-trigger"
      className={cn(accordionTriggerVariants({ size }), className)}
    >
      <span className="min-w-0 wrap-anywhere">{children}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="mt-0.5 size-4 shrink-0 transition-transform motion-reduce:transition-none"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </summary>
  );
}

export type AccordionContentProps = ComponentProps<"div">;

export function AccordionContent({
  className,
  ...props
}: AccordionContentProps) {
  return (
    <div
      {...props}
      data-slot="accordion-content"
      className={cn(
        "min-w-0 space-y-3 pb-4 text-sm leading-relaxed text-muted-foreground wrap-anywhere",
        className,
      )}
    />
  );
}
