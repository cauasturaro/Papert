"use client";

import { useEffect, type ReactNode } from "react";
import Link from "next/link";
import { catchError, type ErrorInfo } from "next/error";

import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "../button/button";

export type ErrorPanelProps = {
  title?: string;
  message?: ReactNode;
  onRetry?: () => void;
  retryLabel?: string;
  // Extra buttons or links after "Try again", such as "Download your files".
  actions?: ReactNode;
  headingLevel?: "h1" | "h2" | "h3";
  // "panel" fills a workspace panel; "page" centers a wider block for route errors.
  layout?: "panel" | "page";
  className?: string;
};

const DEFAULT_TITLE = "Something went wrong";
const DEFAULT_MESSAGE =
  "This part of Papert stopped working. Try again, and reload the page if it keeps happening.";

function AlertIcon() {
  return (
    <svg
      className="size-5 text-destructive"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4.5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

/** Fallback view for a failed panel or page: title, short message, Try again and optional actions. */
export function ErrorPanel({
  title = DEFAULT_TITLE,
  message = DEFAULT_MESSAGE,
  onRetry,
  retryLabel = "Try again",
  actions,
  headingLevel = "h2",
  layout = "panel",
  className,
}: ErrorPanelProps) {
  const Heading = headingLevel;

  return (
    <div
      role="alert"
      data-slot="error-panel"
      className={cn(
        "flex min-w-0 flex-col gap-3 wrap-anywhere",
        layout === "panel" &&
          "h-full items-center justify-center p-6 text-center",
        layout === "page" && "mx-auto w-full max-w-xl px-6 py-16",
        className,
      )}
    >
      <AlertIcon />

      <Heading
        className={cn(
          "font-semibold text-foreground",
          layout === "page" ? "text-2xl" : "text-base",
        )}
      >
        {title}
      </Heading>

      <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
        {message}
      </p>

      <div
        className={cn(
          "flex flex-wrap items-center gap-2",
          layout === "panel" && "justify-center",
        )}
      >
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}

        {actions}
      </div>
    </div>
  );
}

function reportError(error: unknown) {
  // Next forwards server errors with a digest that matches the server logs.
  console.error(error);
}

export type PanelErrorBoundaryProps = Omit<
  ErrorPanelProps,
  "onRetry" | "layout"
> & {
  onError?: (error: unknown) => void;
};

function PanelFallback({
  props,
  errorInfo,
}: {
  props: PanelErrorBoundaryProps;
  errorInfo: ErrorInfo;
}) {
  const { onError, ...panel } = props;
  const { error, reset } = errorInfo;

  useEffect(() => {
    reportError(error);
    onError?.(error);
  }, [error, onError]);

  // `reset` re-renders only this panel; the rest of the page keeps its state.
  return <ErrorPanel {...panel} layout="panel" onRetry={reset} />;
}

/**
 * Error boundary for one panel: a crash inside shows `ErrorPanel` with Try again
 * instead of taking down the page. Router errors (redirect, notFound) pass through, and
 * navigating to another route clears the error.
 */
export const PanelErrorBoundary = catchError(
  (props: PanelErrorBoundaryProps, errorInfo: ErrorInfo) => (
    <PanelFallback props={props} errorInfo={errorInfo} />
  ),
);

export type RouteErrorViewProps = {
  error: unknown;
  // Pass the `retry` prop of `error.tsx`; it re-fetches and re-renders the segment.
  retry: () => void;
  title?: string;
  message?: ReactNode;
  actions?: ReactNode;
  homeHref?: string;
  homeLabel?: string;
};

/** Body for route-level `error.tsx` files: learner copy, Try again and a link home. */
export function RouteErrorView({
  error,
  retry,
  title = "This page could not load",
  message = "Something went wrong on our side. Try again, or go back to the home page.",
  actions,
  homeHref = "/",
  homeLabel = "Back to home",
}: RouteErrorViewProps) {
  useEffect(() => {
    reportError(error);
  }, [error]);

  const homeLink = (
    <Link
      href={homeHref}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      {homeLabel}
    </Link>
  );

  return (
    <ErrorPanel
      layout="page"
      headingLevel="h1"
      title={title}
      message={message}
      onRetry={retry}
      actions={
        <>
          {actions}
          {homeLink}
        </>
      }
    />
  );
}
