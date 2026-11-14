"use client";

import type { ComponentProps } from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export type TabsProps = Omit<
  ComponentProps<typeof TabsPrimitive.Root>,
  "orientation" | "activationMode" | "asChild"
>;

export function Tabs({ className, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      {...props}
      orientation="horizontal"
      activationMode="manual"
      data-slot="tabs"
      className={cn("w-full min-w-0 space-y-4", className)}
    />
  );
}

export type TabsListProps = ComponentProps<typeof TabsPrimitive.List>;

export function TabsList({ className, ...props }: TabsListProps) {
  return (
    <TabsPrimitive.List
      {...props}
      data-slot="tabs-list"
      className={cn(
        "inline-flex w-fit max-w-full items-center gap-1 overflow-x-auto touch-pan-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-md bg-muted p-1",
        className,
      )}
    />
  );
}

export const tabsTriggerVariants = cva(
  "inline-flex shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-sm border border-transparent font-medium whitespace-nowrap text-muted-foreground transition-colors enabled:hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=active]:border-border data-[state=active]:bg-card data-[state=active]:font-semibold data-[state=active]:text-foreground data-[state=active]:shadow-xs contrast-more:data-[state=active]:border-input motion-reduce:transition-none",
  {
    variants: {
      size: {
        sm: "h-control-sm px-3 text-sm",
        md: "h-control-md px-4 text-sm",
        lg: "h-control-lg px-5 text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type TabsTriggerProps = ComponentProps<typeof TabsPrimitive.Trigger> &
  VariantProps<typeof tabsTriggerVariants>;

export function TabsTrigger({ className, size, ...props }: TabsTriggerProps) {
  return (
    <TabsPrimitive.Trigger
      {...props}
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ size }), className)}
    />
  );
}

export type TabsContentProps = Omit<
  ComponentProps<typeof TabsPrimitive.Content>,
  "forceMount" | "asChild"
>;

export function TabsContent({ className, ...props }: TabsContentProps) {
  return (
    <TabsPrimitive.Content
      {...props}
      forceMount
      data-slot="tabs-content"
      className={cn(
        "min-w-0 wrap-anywhere focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring data-[state=inactive]:hidden",
        className,
      )}
    />
  );
}
