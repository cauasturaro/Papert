"use client";

import type { ComponentProps, MouseEvent } from "react";

import { cn } from "@/lib/utils";

export type SkipLinkProps = Omit<ComponentProps<"a">, "href"> & {
  // Id of the element that receives focus, without "#".
  targetId: string;
};

/** Visually hidden until focused; moves focus to `targetId`, such as "Skip to editor". */
export function SkipLink({
  targetId,
  children = "Skip to main content",
  className,
  onClick,
  ...props
}: SkipLinkProps) {
  function skip(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    const target = document.getElementById(targetId);

    if (event.defaultPrevented || !target) {
      return;
    }

    // Containers such as the editor panel are not focusable by default.
    event.preventDefault();

    if (!target.hasAttribute("tabindex") && target.tabIndex < 0) {
      target.setAttribute("tabindex", "-1");
    }

    target.focus();
    target.scrollIntoView({ block: "nearest" });
  }

  return (
    <a
      {...props}
      href={`#${targetId}`}
      data-slot="skip-link"
      className={cn(
        "sr-only rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground shadow-md focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      onClick={skip}
    >
      {children}
    </a>
  );
}
