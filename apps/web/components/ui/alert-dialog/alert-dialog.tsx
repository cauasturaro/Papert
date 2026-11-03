"use client";

import { useId, useState, type ReactNode } from "react";
import { Button } from "../button/button";
import {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogFooter,
  type DialogProps,
} from "../dialog/dialog";
import { AlertDialogSkeleton } from "./alert-dialog-skeleton";

export { dialogVariants as alertDialogVariants } from "../dialog/dialog";

export type AlertDialogProps = Omit<
  DialogProps,
  "children" | "title" | "role" | "aria-labelledby" | "aria-describedby"
> & {
  title: string;
  description: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  pending?: boolean;
  error?: string;
};
export function AlertDialog({ skeleton = false, ...props }: AlertDialogProps) {
  if (skeleton)
    return (
      <AlertDialogSkeleton
        id={props.id}
        size={props.size}
        style={props.style}
        className={props.className}
      />
    );
  return <AlertDialogControl {...props} />;
}
function AlertDialogControl({
  title,
  description,
  onConfirm,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  pending = false,
  error,
  open,
  defaultOpen = false,
  onOpenChange,
  onCancel,
  size,
  ...props
}: AlertDialogProps) {
  const id = useId();
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  function changeOpen(next: boolean) {
    if (pending) return;
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }
  return (
    <Dialog
      {...props}
      size={size ?? "md"}
      role="alertdialog"
      open={open ?? internalOpen}
      onOpenChange={changeOpen}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={pending || undefined}
      data-alert-dialog=""
      onCancel={(event) => {
        onCancel?.(event);
        if (pending) event.preventDefault();
      }}
    >
      <header className="space-y-2 p-(--dialog-padding)">
        <DialogTitle id={`${id}-title`}>{title}</DialogTitle>
        <DialogDescription id={`${id}-description`}>
          {description}
        </DialogDescription>
      </header>
      {error && (
        <DialogContent>
          <p role="alert" className="text-destructive">
            {error}
          </p>
        </DialogContent>
      )}
      <DialogFooter className="justify-between max-sm:flex-col-reverse">
        <Button
          autoFocus
          variant="outline"
          size={size ?? "md"}
          disabled={pending}
          onClick={() => changeOpen(false)}
        >
          {cancelLabel}
        </Button>
        <Button
          variant="destructive"
          size={size ?? "md"}
          loading={pending}
          onClick={() => {
            if (!pending) onConfirm();
          }}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  );
}
