"use client";

import {
  createContext,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { Button } from "../button/button";
import { CloseIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export const dialogVariants = cva(
  "fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-lg p-0 border border-border bg-card text-card-foreground shadow-lg backdrop:bg-overlay",
  {
    variants: {
      size: {
        sm: "max-w-sm [--dialog-padding:1rem]",
        md: "max-w-lg [--dialog-padding:1.25rem] sm:[--dialog-padding:1.5rem]",
        lg: "max-w-[40rem] [--dialog-padding:1.5rem] sm:[--dialog-padding:2rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

const DialogContext = createContext<{
  close: () => void;
  closeLabel: string;
  titleId: string;
} | null>(null);

export type DialogProps = Omit<ComponentProps<"dialog">, "open"> &
  VariantProps<typeof dialogVariants> & {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    closeLabel?: string;
  };


export function Dialog({
  open,
  defaultOpen = false,
  onOpenChange,
  closeLabel = "Close",
  size,
  className,
  children,
  ref,
  onCancel,
  onClose,
  onKeyDown,
  ...props
}: DialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = open ?? internalOpen;

  useImperativeHandle(ref, () => dialogRef.current!);

  function changeOpen(nextOpen: boolean) {
    if (open === undefined) {
      setInternalOpen(nextOpen);
    }

    onOpenChange?.(nextOpen);
  }

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }

    if (isOpen && !dialog.open) {
      dialog.showModal();
    }

    if (!isOpen && dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      {...props}
      aria-labelledby={
        props["aria-labelledby"] ?? (props["aria-label"] ? undefined : titleId)
      }
      ref={dialogRef}
      data-slot="dialog"
      className={cn(dialogVariants({ size }), className)}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || event.key !== "Tab") {
          return;
        }

        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            "a[href], button, input, select, textarea, summary, [tabindex], [contenteditable=true]",
          ),
        ).filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(":disabled") &&
            !element.closest("[inert]") &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== "hidden",
        );

        const first = controls[0];
        const last = controls[controls.length - 1];

        // Keeps Tab at either end from moving focus into the browser chrome.
        if (event.shiftKey && event.target === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && event.target === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        onCancel?.(event);
        if (event.defaultPrevented) {
          return;
        }

        event.preventDefault();
        changeOpen(false);
      }}
      onClose={(event) => {
        onClose?.(event);

        // close() also emits this event after a prop-controlled close.
        if (!isOpen || event.currentTarget.open) {
          return;
        }

        if (open !== undefined) {
          event.currentTarget.showModal();
        }

        changeOpen(false);
      }}
    >
      <DialogContext.Provider
        value={{ close: () => changeOpen(false), closeLabel, titleId }}
      >
        <div className="flex max-h-[calc(100dvh-2rem-2px)] flex-col">
          {children}
        </div>
      </DialogContext.Provider>
    </dialog>
  );
}

export type DialogHeaderProps = ComponentProps<"header">;
export function DialogHeader({
  className,
  children,
  ...props
}: DialogHeaderProps) {
  const dialog = useContext(DialogContext);
  if (!dialog) {
    throw new Error("DialogHeader must be rendered inside Dialog.");
  }

  return (
    <header
      {...props}
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 items-start gap-4 p-(--dialog-padding)",
        className,
      )}
    >
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
      <Button
        variant="ghost"
        size="sm"
        iconOnly
        className="-mt-1 -mr-1 shrink-0 touch-manipulation"
        aria-label={dialog.closeLabel}
        onClick={dialog.close}
      >
        <CloseIcon strokeWidth={1.5} />
      </Button>
    </header>
  );
}

export type DialogTitleProps = ComponentProps<"h2">;
export function DialogTitle({ className, id, ...props }: DialogTitleProps) {
  const dialog = useContext(DialogContext);

  return (
    <h2
      {...props}
      id={id ?? dialog?.titleId}
      data-slot="dialog-title"
      className={cn(
        "text-lg font-semibold tracking-tight wrap-anywhere",
        className,
      )}
    />
  );
}

export type DialogDescriptionProps = ComponentProps<"p">;
export function DialogDescription({
  className,
  ...props
}: DialogDescriptionProps) {
  return (
    <p
      {...props}
      data-slot="dialog-description"
      className={cn(
        "text-sm leading-relaxed text-muted-foreground wrap-anywhere",
        className,
      )}
    />
  );
}

export type DialogContentProps = ComponentProps<"div">;
export function DialogContent({ className, ...props }: DialogContentProps) {
  return (
    <div
      {...props}
      data-slot="dialog-content"
      className={cn(
        "min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto px-(--dialog-padding) pb-(--dialog-padding) text-sm wrap-anywhere",
        className,
      )}
    />
  );
}

export type DialogFooterProps = ComponentProps<"div">;
export function DialogFooter({ className, ...props }: DialogFooterProps) {
  return (
    <div
      {...props}
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-wrap justify-end gap-3 border-t border-border px-(--dialog-padding) py-4 max-sm:[&>button]:w-full",
        className,
      )}
    />
  );
}
