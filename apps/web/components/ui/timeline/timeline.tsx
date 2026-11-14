import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const timelineVariants = cva(
  "w-full min-w-0 list-none text-card-foreground",
  {
    variants: {
      size: {
        sm: "[--timeline-gap:1rem] [--timeline-text:0.875rem] [--timeline-marker:1.5rem]",
        md: "[--timeline-gap:1.5rem] [--timeline-text:0.875rem] [--timeline-marker:2rem]",
        lg: "[--timeline-gap:2rem] [--timeline-text:1rem] [--timeline-marker:2.5rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);
export type TimelineProps = ComponentProps<"ol"> &
  VariantProps<typeof timelineVariants>;
export type TimelineItemProps = ComponentProps<"li"> & { marker?: ReactNode };
export type TimelineTitleProps = ComponentProps<"h3"> & {
  as?: "h2" | "h3" | "h4" | "h5" | "h6";
};
export type TimelineTimeProps = ComponentProps<"time">;
export type TimelineContentProps = ComponentProps<"div">;

export function Timeline({ size, className, ...props }: TimelineProps) {
  return (
    <ol
      {...props}
      role={props.role ?? "list"}
      data-slot="timeline"
      className={cn(timelineVariants({ size: size ?? "md" }), className)}
    />
  );
}

export function TimelineItem({
  marker,
  children,
  className,
  ...props
}: TimelineItemProps) {
  return (
    <li
      {...props}
      data-slot="timeline-item"
      className={cn(
        "relative grid min-w-0 grid-cols-[var(--timeline-marker)_minmax(0,1fr)] gap-x-3 pb-(--timeline-gap) before:absolute before:start-[calc(var(--timeline-marker)/2)] before:top-(--timeline-marker) before:bottom-0 before:border-s before:border-border last:pb-0 last:before:hidden",
        className,
      )}
    >
      <span
        aria-hidden="true"
        data-slot="timeline-marker"
        className="col-start-1 row-start-1 flex size-(--timeline-marker) items-center justify-center rounded-full border border-border bg-muted text-muted-foreground [&>svg]:size-4"
      >
        {marker ?? (
          <span className="size-2 rounded-full bg-primary forced-colors:bg-[CanvasText]" />
        )}
      </span>
      <div className="col-start-2 row-start-1 min-w-0 space-y-2 pt-0.5 text-(length:--timeline-text) wrap-anywhere">
        {children}
      </div>
    </li>
  );
}

export function TimelineTitle({
  as: Heading = "h3",
  className,
  ...props
}: TimelineTitleProps) {
  return (
    <Heading
      {...props}
      data-slot="timeline-title"
      className={cn("font-medium", className)}
    />
  );
}
export function TimelineTime({ className, ...props }: TimelineTimeProps) {
  return (
    <time
      {...props}
      data-slot="timeline-time"
      className={cn("block text-xs text-muted-foreground", className)}
    />
  );
}
export function TimelineContent({ className, ...props }: TimelineContentProps) {
  return (
    <div
      {...props}
      data-slot="timeline-content"
      className={cn("space-y-3 text-muted-foreground", className)}
    />
  );
}
