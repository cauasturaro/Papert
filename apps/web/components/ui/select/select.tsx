"use client";

import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { cva, type VariantProps } from "class-variance-authority";

import { CheckIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export const selectVariants = cva(
  "flex w-full min-w-0 items-center justify-between gap-3 rounded-md border border-input bg-card text-left text-base text-foreground transition-colors touch-manipulation enabled:hover:border-input focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/15 focus-visible:outline-none forced-colors:focus-visible:outline-solid forced-colors:focus-visible:outline-2 forced-colors:focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:opacity-60 aria-invalid:border-destructive aria-invalid:focus-visible:border-destructive aria-invalid:focus-visible:ring-destructive/15 data-[placeholder]:text-muted-foreground motion-reduce:transition-none [&>span:first-child]:min-w-0 [&>span:first-child]:truncate",
  {
    variants: {
      size: {
        sm: "h-control-sm px-3 md:text-sm",
        md: "h-control-md px-4 md:text-sm",
        lg: "h-control-lg px-5",
      },
    },
    defaultVariants: { size: "md" },
  },
);

export type SelectProps = Omit<
  ComponentProps<typeof SelectPrimitive.Trigger>,
  "value" | "defaultValue" | "onChange" | "dir" | "asChild"
> &
  Pick<
    ComponentProps<typeof SelectPrimitive.Root>,
    | "value"
    | "defaultValue"
    | "onValueChange"
    | "open"
    | "defaultOpen"
    | "onOpenChange"
    | "name"
    | "form"
    | "required"
    | "disabled"
    | "dir"
    | "autoComplete"
  > &
  VariantProps<typeof selectVariants> & {
    placeholder?: ReactNode;
  };


export function Select({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  name,
  form,
  required,
  disabled,
  dir,
  autoComplete,
  placeholder = "Select an option",
  className,
  size,
  children,
  ref,
  ...props
}: SelectProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [container, setContainer] = useState<HTMLDialogElement | null>(null);

  useImperativeHandle(ref, () => triggerRef.current!);

  const attachTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;

    // The menu must stay in the top layer when used inside a native Dialog.
    setContainer(node?.closest<HTMLDialogElement>("dialog") ?? null);
  }, []);

  return (
    <SelectPrimitive.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={onValueChange}
      open={open}
      defaultOpen={defaultOpen}
      onOpenChange={onOpenChange}
      name={name}
      form={form}
      required={required}
      disabled={disabled}
      dir={dir}
      autoComplete={autoComplete}
    >
      <SelectPrimitive.Trigger
        {...props}
        ref={attachTrigger}
        data-slot="select"
        className={cn(selectVariants({ size }), className)}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-4 shrink-0 text-muted-foreground"
          >
            <path d="m7 10 5 5 5-5" />
          </svg>
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={container}>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          collisionPadding={12}
          data-slot="select-content"
          className="z-50 max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-(--radix-select-trigger-width) max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-md"
        >
          <SelectPrimitive.ScrollUpButton
            className="flex h-6 items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="m17 14-5-5-5 5" />
            </svg>
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="p-1">
            {children}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton
            className="flex h-6 items-center justify-center text-muted-foreground"
            aria-hidden="true"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="size-4"
            >
              <path d="m7 10 5 5 5-5" />
            </svg>
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export type SelectItemProps = ComponentProps<typeof SelectPrimitive.Item>;
export function SelectItem({ className, children, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      {...props}
      data-slot="select-item"
      className={cn(
        "relative flex min-h-10 sm:min-h-9 cursor-default items-center rounded-sm py-2 pr-9 pl-3 text-sm wrap-anywhere outline-none select-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 forced-colors:data-[highlighted]:outline-2",
        className,
      )}
    >
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex items-center">
        <CheckIcon className="size-4" strokeWidth={1.5} />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}
