"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  useImperativeHandle,
  type ComponentProps,
  type RefObject,
} from "react";
import Link from "next/link";
import * as Primitive from "@radix-ui/react-dropdown-menu";
import { cva, type VariantProps } from "class-variance-authority";
import { Button, type ButtonProps } from "../button/button";
import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export const dropdownMenuVariants = cva(
  "z-50 min-w-44 max-w-[calc(100vw-1.5rem)] max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md forced-colors:border-[CanvasText]",
  {
    variants: {
      size: {
        sm: "[--menu-height:2rem] [--menu-padding:0.5rem] text-sm",
        md: "[--menu-height:2.5rem] [--menu-padding:0.75rem] text-sm",
        lg: "[--menu-height:3rem] [--menu-padding:1rem] text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);
export const dropdownMenuItemVariants = cva(
  "flex min-h-(--menu-height) cursor-default touch-manipulation items-center gap-2 rounded-sm px-(--menu-padding) py-2 wrap-anywhere outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 forced-colors:data-[highlighted]:outline-solid forced-colors:data-[highlighted]:outline-2 forced-colors:data-[highlighted]:-outline-offset-2",
  {
    variants: {
      variant: {
        default: "",
        destructive:
          "text-destructive data-[highlighted]:bg-destructive data-[highlighted]:text-destructive-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
const MenuContext = createContext<{
  size: VariantProps<typeof dropdownMenuVariants>["size"];
  container: HTMLDialogElement | null;
  setContainer: (node: HTMLDialogElement | null) => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  tabbingRef: RefObject<boolean>;
  close: () => void;
} | null>(null);
function useMenu() {
  const context = useContext(MenuContext);
  if (!context) {
    throw new Error("DropdownMenu parts must be rendered inside DropdownMenu.");
  }
  return context;
}
export type DropdownMenuProps = ComponentProps<typeof Primitive.Root> &
  VariantProps<typeof dropdownMenuVariants> &
  Pick<ComponentProps<"span">, "id" | "className" | "style">;
export function DropdownMenu({
  size = "md",
  className,
  id,
  style,
  children,
  modal = false,
  open,
  defaultOpen = false,
  onOpenChange,
  ...props
}: DropdownMenuProps) {
  const [container, setContainer] = useState<HTMLDialogElement | null>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tabbingRef = useRef(false);
  function changeOpen(next: boolean) {
    if (open === undefined) {
      setInternalOpen(next);
    }
    onOpenChange?.(next);
  }
  return (
    <span id={id} style={style} className={className} data-slot="dropdown-menu">
      <MenuContext.Provider
        value={{
          size: size ?? "md",
          container,
          setContainer,
          triggerRef,
          tabbingRef,
          close: () => changeOpen(false),
        }}
      >
        <Primitive.Root
          {...props}
          modal={modal}
          open={open ?? internalOpen}
          onOpenChange={changeOpen}
        >
          {children}
        </Primitive.Root>
      </MenuContext.Provider>
    </span>
  );
}
export type DropdownMenuTriggerProps = ButtonProps;
export function DropdownMenuTrigger({
  ref,
  size,
  variant = "outline",
  ...props
}: DropdownMenuTriggerProps) {
  const context = useMenu();
  const { setContainer, triggerRef } = context;
  useImperativeHandle(ref, () => triggerRef.current!);
  const attach = useCallback(
    (node: HTMLButtonElement | null) => {
      triggerRef.current = node;
      setContainer(node?.closest("dialog") ?? null);
    },
    [setContainer, triggerRef],
  );
  return (
    <Primitive.Trigger asChild>
      <Button
        {...props}
        ref={attach}
        size={size ?? context.size ?? "md"}
        variant={variant}
      />
    </Primitive.Trigger>
  );
}
export type DropdownMenuContentProps = Omit<
  ComponentProps<typeof Primitive.Content>,
  "asChild"
>;
export function DropdownMenuContent({
  className,
  align = "start",
  sideOffset = 6,
  collisionPadding = 16,
  onKeyDownCapture,
  onCloseAutoFocus,
  ...props
}: DropdownMenuContentProps) {
  const { size, container, triggerRef, tabbingRef, close } = useMenu();
  return (
    <Primitive.Portal container={container}>
      <Primitive.Content
        {...props}
        onKeyDownCapture={(event) => {
          onKeyDownCapture?.(event);
          if (event.defaultPrevented || event.key !== "Tab") {
            return;
          }
          // Radix traps Tab in the menu; leaving must follow the trigger order.
          tabbingRef.current = true;
          triggerRef.current?.focus();
          close();
          event.stopPropagation();
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (tabbingRef.current) {
            event.preventDefault();
            tabbingRef.current = false;
          }
        }}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        data-slot="dropdown-menu-content"
        className={cn(dropdownMenuVariants({ size: size ?? "md" }), className)}
      />
    </Primitive.Portal>
  );
}
export type DropdownMenuItemProps = Omit<
  ComponentProps<typeof Primitive.Item>,
  "asChild"
> &
  VariantProps<typeof dropdownMenuItemVariants>;
export function DropdownMenuItem({
  className,
  variant,
  ...props
}: DropdownMenuItemProps) {
  return (
    <Primitive.Item
      {...props}
      data-slot="dropdown-menu-item"
      className={cn(dropdownMenuItemVariants({ variant }), className)}
    />
  );
}
export type DropdownMenuLinkProps = Omit<
  ComponentProps<typeof Link>,
  "onSelect"
> &
  Pick<DropdownMenuItemProps, "onSelect" | "variant">;
export function DropdownMenuLink({
  onSelect,
  variant,
  className,
  ...props
}: DropdownMenuLinkProps) {
  return (
    <Primitive.Item asChild onSelect={onSelect}>
      <Link
        {...props}
        data-slot="dropdown-menu-item"
        className={cn(dropdownMenuItemVariants({ variant }), className)}
      />
    </Primitive.Item>
  );
}
export type DropdownMenuLabelProps = ComponentProps<typeof Primitive.Label>;
export function DropdownMenuLabel({
  className,
  ...props
}: DropdownMenuLabelProps) {
  return (
    <Primitive.Label
      {...props}
      className={cn(
        "px-(--menu-padding) py-2 text-xs font-semibold text-muted-foreground wrap-anywhere",
        className,
      )}
    />
  );
}
export type DropdownMenuSeparatorProps = ComponentProps<
  typeof Primitive.Separator
>;
export function DropdownMenuSeparator({
  className,
  ...props
}: DropdownMenuSeparatorProps) {
  return (
    <Primitive.Separator
      {...props}
      className={cn("my-1 border-t border-border", className)}
    />
  );
}

export const DropdownMenuRadioGroup = Primitive.RadioGroup;

export type DropdownMenuRadioItemProps = ComponentProps<typeof Primitive.RadioItem>;

export function DropdownMenuRadioItem({
  className,
  children,
  ...props
}: DropdownMenuRadioItemProps) {
  return (
    <Primitive.RadioItem
      {...props}
      className={cn(dropdownMenuItemVariants(), className)}
    >
      {children}
      <Primitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </Primitive.ItemIndicator>
    </Primitive.RadioItem>
  );
}

export type DropdownMenuCheckboxItemProps = ComponentProps<typeof Primitive.CheckboxItem>;

export function DropdownMenuCheckboxItem({
  className,
  children,
  ...props
}: DropdownMenuCheckboxItemProps) {
  return (
    <Primitive.CheckboxItem
      {...props}
      className={cn(dropdownMenuItemVariants(), className)}
    >
      {children}
      <Primitive.ItemIndicator>
        <CheckIcon className="size-4" />
      </Primitive.ItemIndicator>
    </Primitive.CheckboxItem>
  );
}
