import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { SeparatorSkeleton } from "./separator-skeleton";
import { DraggableSeparator } from "./separator-draggable";

export const separatorVariants = cva("shrink-0 border-0 border-border", {
  variants: {
    orientation: {
      horizontal: "h-0 w-full border-t",
      vertical: "h-auto w-0 self-stretch border-l",
    },
    draggable: {
      true: "relative flex touch-none items-center justify-center rounded-xs border-0 select-none hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring data-[resizing=true]:bg-accent before:absolute before:bg-border forced-colors:before:bg-[CanvasText]",
      false: "",
    },
  },
  compoundVariants: [
    {
      orientation: "horizontal",
      draggable: true,
      className: "h-6 cursor-row-resize before:h-px before:w-full",
    },
    {
      orientation: "vertical",
      draggable: true,
      className: "w-6 cursor-col-resize before:h-full before:w-px",
    },
  ],
  defaultVariants: { orientation: "horizontal", draggable: false },
});

export type SeparatorProps = Omit<
  ComponentProps<"div">,
  | "children"
  | "dangerouslySetInnerHTML"
  | "role"
  | "tabIndex"
  | "aria-orientation"
  | "aria-hidden"
  | "draggable"
> &
  VariantProps<typeof separatorVariants> & {
    decorative?: boolean;
    draggable?: boolean;
    skeleton?: boolean;
  };

export function Separator({
  orientation = "horizontal",
  decorative = true,
  draggable = false,
  skeleton = false,
  className,
  ...props
}: SeparatorProps) {
  if (skeleton)
    return (
      <SeparatorSkeleton
        orientation={orientation}
        draggable={draggable}
        className={className}
        id={props.id}
        style={props.style}
      />
    );
  if (draggable)
    return (
      <DraggableSeparator
        {...props}
        orientation={orientation ?? "horizontal"}
        className={cn(
          separatorVariants({
            orientation: orientation ?? "horizontal",
            draggable: true,
          }),
          className,
        )}
      />
    );
  return (
    <div
      {...props}
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      aria-hidden={decorative ? true : undefined}
      aria-orientation={decorative ? undefined : (orientation ?? "horizontal")}
      className={cn(
        separatorVariants({ orientation: orientation ?? "horizontal" }),
        className,
      )}
    />
  );
}
