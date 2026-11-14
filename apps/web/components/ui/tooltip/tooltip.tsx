"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { Button, buttonVariants, type ButtonProps } from "../button/button";
import { cn } from "@/lib/utils";

export const tooltipVariants = cva(
  "fixed inset-auto m-0 w-max max-w-[min(20rem,calc(100vw-1rem))] overflow-y-auto rounded-sm border border-border bg-popover text-popover-foreground shadow-sm wrap-anywhere forced-colors:border-[CanvasText]",
  {
    variants: {
      size: {
        sm: "px-2 py-1 text-xs",
        md: "px-3 py-2 text-sm",
        lg: "px-4 py-3 text-base",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type TooltipSize = VariantProps<typeof tooltipVariants>["size"];
const TooltipContext = createContext<{
  descriptionId?: string;
  size: TooltipSize;
} | null>(null);

export type TooltipProps = ComponentProps<"span"> &
  VariantProps<typeof tooltipVariants> & {
    side?: "top" | "right" | "bottom" | "left";
    delayDuration?: number;
    content: string;
  };

export function Tooltip({
  content,
  size,
  side = "top",
  delayDuration = 400,
  className,
  children,
  ref,
  onPointerEnter,
  onPointerLeave,
  onPointerDown,
  onFocus,
  onBlur,
  ...props
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hovered = useRef(false);
  const contentHovered = useRef(false);
  const descriptionId = useId();

  function clearTimer() {
    clearTimeout(timer.current);
  }

  function dismiss() {
    clearTimer();
    contentHovered.current = false;
    setOpen(false);
  }

  function scheduleClose() {
    clearTimer();
    timer.current = setTimeout(() => {
      if (
        !hovered.current &&
        !contentHovered.current &&
        !rootRef.current?.contains(document.activeElement)
      ) {
        setOpen(false);
      }
    }, 150);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    const tip = tipRef.current;
    const root = rootRef.current;
    if (!open || !tip || !root) {
      return;
    }
    tip.showPopover();

    function position() {
      if (!tip || !root) {
        return;
      }
      const target = root.getBoundingClientRect();
      const box = tip.getBoundingClientRect();
      const width = document.documentElement.clientWidth;
      const height = window.innerHeight;
      const detached =
        target.bottom <= 0 ||
        target.top >= height ||
        target.right <= 0 ||
        target.left >= width;
      tip.style.visibility = detached ? "hidden" : "";
      if (detached) {
        return;
      }
      const gap = 6;
      const margin = 8;
      let placement = side;
      if (side === "top" && target.top < box.height + gap + margin) {
        placement = "bottom";
      }
      if (
        side === "bottom" &&
        height - target.bottom < box.height + gap + margin
      ) {
        placement = "top";
      }
      if (side === "left" && target.left < box.width + gap + margin) {
        placement = "right";
      }
      if (side === "right" && width - target.right < box.width + gap + margin) {
        placement = "left";
      }
      let left = target.left + (target.width - box.width) / 2;
      let top = target.top + (target.height - box.height) / 2;
      if (placement === "top") {
        top = target.top - box.height - gap;
      }
      if (placement === "bottom") {
        top = target.bottom + gap;
      }
      if (placement === "left") {
        left = target.left - box.width - gap;
      }
      if (placement === "right") {
        left = target.right + gap;
      }
      tip.style.left = `${Math.max(margin, Math.min(left, width - box.width - margin))}px`;
      tip.style.top = `${Math.max(margin, Math.min(top, height - box.height - margin))}px`;
      tip.dataset.side = placement;
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(root);
    observer.observe(tip);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }
      // Closes only the tooltip before Escape reaches an ancestor Dialog.
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(timer.current);
      setOpen(false);
    }
    document.addEventListener("keydown", escape, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("keydown", escape, true);
      if (tip.matches(":popover-open")) {
        tip.hidePopover();
      }
    };
  }, [open, side, content, size]);

  return (
    <TooltipContext.Provider
      value={{ descriptionId: open ? descriptionId : undefined, size }}
    >
      <span
        {...props}
        ref={(node) => {
          rootRef.current = node;
          if (typeof ref === "function") {
            return ref(node);
          }
          if (ref) {
            ref.current = node;
          }
        }}
        data-slot="tooltip"
        className={cn("inline-flex max-w-full align-middle", className)}
        onPointerEnter={(event) => {
          onPointerEnter?.(event);
          if (event.defaultPrevented || event.pointerType === "touch") {
            return;
          }
          hovered.current = true;
          clearTimer();
          timer.current = setTimeout(() => setOpen(true), delayDuration);
        }}
        onPointerLeave={(event) => {
          onPointerLeave?.(event);
          hovered.current = false;
          scheduleClose();
        }}
        onPointerDown={(event) => {
          onPointerDown?.(event);
          dismiss();
        }}
        onFocus={(event) => {
          onFocus?.(event);
          // Papert: only keyboard focus opens it; clicks and programmatic
          // focus (e.g. returning focus after a panel expands) do not.
          const keyboardFocus = event.target.matches(":focus-visible");

          if (!event.defaultPrevented && keyboardFocus) {
            clearTimer();
            setOpen(true);
          }
        }}
        onBlur={(event) => {
          onBlur?.(event);
          dismiss();
        }}
      >
        {children}
        <span
          ref={tipRef}
          id={descriptionId}
          popover="manual"
          role="tooltip"
          onPointerEnter={() => {
            contentHovered.current = true;
            clearTimer();
          }}
          onPointerLeave={() => {
            contentHovered.current = false;
            scheduleClose();
          }}
          data-slot="tooltip-content"
          className={cn(
            tooltipVariants({ size: size ?? "md" }),
            "max-h-[calc(100dvh-1rem)]",
          )}
        >
          {content}
        </span>
      </span>
    </TooltipContext.Provider>
  );
}

function useTooltip() {
  const context = useContext(TooltipContext);
  if (!context) {
    throw new Error(
      "TooltipTrigger and TooltipLink must be rendered inside Tooltip.",
    );
  }
  return context;
}

export type TooltipTriggerProps = ButtonProps;
export function TooltipTrigger({
  "aria-describedby": describedBy,
  size,
  ...props
}: TooltipTriggerProps) {
  const tooltip = useTooltip();
  return (
    <Button
      {...props}
      size={size ?? tooltip.size}
      aria-describedby={
        [describedBy, tooltip.descriptionId].filter(Boolean).join(" ") ||
        undefined
      }
    />
  );
}

export type TooltipLinkProps = ComponentProps<typeof Link> &
  VariantProps<typeof buttonVariants>;
export function TooltipLink({
  "aria-describedby": describedBy,
  size,
  variant = "ghost",
  iconOnly,
  className,
  ...props
}: TooltipLinkProps) {
  const tooltip = useTooltip();
  return (
    <Link
      {...props}
      aria-describedby={
        [describedBy, tooltip.descriptionId].filter(Boolean).join(" ") ||
        undefined
      }
      className={cn(
        buttonVariants({ size: size ?? tooltip.size, variant, iconOnly }),
        className,
      )}
    />
  );
}
