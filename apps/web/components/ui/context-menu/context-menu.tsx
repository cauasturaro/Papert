"use client";

import { createContext, useContext, type ComponentProps } from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

export const contextMenuVariants = cva(
  "z-50 min-w-44 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md origin-(--radix-context-menu-content-transform-origin) animate-menu-in motion-reduce:animate-none",
  {
    variants: {
      size: {
        sm: "[--context-height:1.75rem] [--context-padding:0.5rem] text-xs",
        md: "[--context-height:2.25rem] [--context-padding:0.75rem] text-sm",
        lg: "[--context-height:2.75rem] [--context-padding:1rem] text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export const contextMenuItemVariants = cva(
  "relative flex min-h-(--context-height) cursor-default select-none items-center gap-2 rounded-sm px-(--context-padding) py-1.5 outline-none transition-colors touch-manipulation data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground forced-colors:data-[highlighted]:outline-solid forced-colors:data-[highlighted]:outline-1",
  {
    variants: {
      variant: {
        default: "",
        destructive:
          "text-destructive data-[highlighted]:bg-destructive data-[highlighted]:text-destructive-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type ContextMenuContextValue = {
  size?: VariantProps<typeof contextMenuVariants>["size"];
};

const ContextMenuContext = createContext<ContextMenuContextValue>({
  size: "md",
});

function useContextMenu() {
  return useContext(ContextMenuContext);
}

export type ContextMenuProps = ComponentProps<
  typeof ContextMenuPrimitive.Root
> &
  VariantProps<typeof contextMenuVariants>;

export function ContextMenu({
  size = "md",
  children,
  ...props
}: ContextMenuProps) {
  return (
    <ContextMenuContext.Provider value={{ size }}>
      <ContextMenuPrimitive.Root {...props}>
        {children}
      </ContextMenuPrimitive.Root>
    </ContextMenuContext.Provider>
  );
}

export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;

export type ContextMenuContentProps = ComponentProps<
  typeof ContextMenuPrimitive.Content
> &
  VariantProps<typeof contextMenuVariants>;

export function ContextMenuContent({
  className,
  size,
  children,
  ...props
}: ContextMenuContentProps) {
  const context = useContextMenu();
  const resolvedSize = size ?? context.size ?? "md";

  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        collisionPadding={16}
        {...props}
        data-slot="context-menu-content"
        className={cn(contextMenuVariants({ size: resolvedSize }), className)}
      >
        {children}
      </ContextMenuPrimitive.Content>
    </ContextMenuPrimitive.Portal>
  );
}

export type ContextMenuItemProps = ComponentProps<
  typeof ContextMenuPrimitive.Item
> &
  VariantProps<typeof contextMenuItemVariants>;

export function ContextMenuItem({
  className,
  variant,
  ...props
}: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
      {...props}
      data-slot="context-menu-item"
      className={cn(contextMenuItemVariants({ variant }), className)}
    />
  );
}
