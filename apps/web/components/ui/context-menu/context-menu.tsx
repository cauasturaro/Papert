"use client";

import { createContext, useContext, type ComponentProps } from "react";
import * as ContextMenuPrimitive from "@radix-ui/react-context-menu";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { ContextMenuSkeleton } from "./context-menu-skeleton";

export const contextMenuVariants = cva(
  "z-50 min-w-44 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-80",
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
      inset: {
        true: "ps-8",
      },
    },
    defaultVariants: {
      variant: "default",
      inset: false,
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
  VariantProps<typeof contextMenuVariants> & {
    skeleton?: boolean;
  };

export function ContextMenu({
  skeleton = false,
  size = "md",
  children,
  ...props
}: ContextMenuProps) {
  if (skeleton) {
    return <ContextMenuSkeleton size={size} />;
  }

  return (
    <ContextMenuContext.Provider value={{ size }}>
      <ContextMenuPrimitive.Root {...props}>
        {children}
      </ContextMenuPrimitive.Root>
    </ContextMenuContext.Provider>
  );
}

export const ContextMenuTrigger = ContextMenuPrimitive.Trigger;
export const ContextMenuGroup = ContextMenuPrimitive.Group;
export const ContextMenuPortal = ContextMenuPrimitive.Portal;
export const ContextMenuSub = ContextMenuPrimitive.Sub;
export const ContextMenuRadioGroup = ContextMenuPrimitive.RadioGroup;

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
  inset,
  ...props
}: ContextMenuItemProps) {
  return (
    <ContextMenuPrimitive.Item
      {...props}
      data-slot="context-menu-item"
      className={cn(contextMenuItemVariants({ variant, inset }), className)}
    />
  );
}

export type ContextMenuCheckboxItemProps = ComponentProps<
  typeof ContextMenuPrimitive.CheckboxItem
>;

export function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: ContextMenuCheckboxItemProps) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      {...props}
      checked={checked}
      data-slot="context-menu-checkbox-item"
      className={cn(
        contextMenuItemVariants({ inset: true }),
        "relative",
        className,
      )}
    >
      <span className="absolute start-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <svg
            className="size-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  );
}

export type ContextMenuRadioItemProps = ComponentProps<
  typeof ContextMenuPrimitive.RadioItem
>;

export function ContextMenuRadioItem({
  className,
  children,
  ...props
}: ContextMenuRadioItemProps) {
  return (
    <ContextMenuPrimitive.RadioItem
      {...props}
      data-slot="context-menu-radio-item"
      className={cn(
        contextMenuItemVariants({ inset: true }),
        "relative",
        className,
      )}
    >
      <span className="absolute start-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <svg
            className="size-2 fill-current"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="8" />
          </svg>
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  );
}

export type ContextMenuSubTriggerProps = ComponentProps<
  typeof ContextMenuPrimitive.SubTrigger
> &
  VariantProps<typeof contextMenuItemVariants>;

export function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: ContextMenuSubTriggerProps) {
  return (
    <ContextMenuPrimitive.SubTrigger
      {...props}
      data-slot="context-menu-sub-trigger"
      className={cn(
        contextMenuItemVariants({ inset }),
        "flex items-center justify-between",
        className,
      )}
    >
      {children}
      <svg
        className="size-4 shrink-0 text-muted-foreground"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </ContextMenuPrimitive.SubTrigger>
  );
}

export type ContextMenuSubContentProps = ComponentProps<
  typeof ContextMenuPrimitive.SubContent
> &
  VariantProps<typeof contextMenuVariants>;

export function ContextMenuSubContent({
  className,
  size,
  ...props
}: ContextMenuSubContentProps) {
  const context = useContextMenu();
  const resolvedSize = size ?? context.size ?? "md";

  return (
    <ContextMenuPrimitive.SubContent
      collisionPadding={16}
      {...props}
      data-slot="context-menu-sub-content"
      className={cn(contextMenuVariants({ size: resolvedSize }), className)}
    />
  );
}

export type ContextMenuLabelProps = ComponentProps<
  typeof ContextMenuPrimitive.Label
> & {
  inset?: boolean;
};

export function ContextMenuLabel({
  className,
  inset,
  ...props
}: ContextMenuLabelProps) {
  return (
    <ContextMenuPrimitive.Label
      {...props}
      data-slot="context-menu-label"
      className={cn(
        "px-(--context-padding) py-1.5 font-semibold text-foreground",
        inset && "ps-8",
        className,
      )}
    />
  );
}

export type ContextMenuSeparatorProps = ComponentProps<
  typeof ContextMenuPrimitive.Separator
>;

export function ContextMenuSeparator({
  className,
  ...props
}: ContextMenuSeparatorProps) {
  return (
    <ContextMenuPrimitive.Separator
      {...props}
      data-slot="context-menu-separator"
      className={cn("-mx-1 my-1 h-px bg-border", className)}
    />
  );
}

export type ContextMenuShortcutProps = ComponentProps<"kbd">;

export function ContextMenuShortcut({
  className,
  children,
  ...props
}: ContextMenuShortcutProps) {
  return (
    <kbd
      {...props}
      data-slot="context-menu-shortcut"
      className={cn(
        "ms-auto text-xs tracking-widest text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
