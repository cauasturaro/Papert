"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { Button, buttonVariants } from "@/components/ui/button/button";
import { CloseIcon } from "@/components/icons";
import { useSessionExpired } from "@/lib/auth/use-session-expired";

/** Shown once for the whole app when a signed-in session stops being accepted. */
export function SessionExpiredBanner() {
  // Dynamic routes resolve the path at request time.
  return (
    <Suspense fallback={null}>
      <ExpiredNotice />
    </Suspense>
  );
}

function ExpiredNotice() {
  const pathname = usePathname();
  const { expired, signInHref, dismiss } = useSessionExpired();

  // The sign-in page already asks for credentials.
  if (!expired || pathname === "/account") {
    return null;
  }

  return (
    <div
      role="alert"
      className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-[min(40rem,calc(100%-2rem))] flex-wrap items-center gap-3 rounded-lg border border-warning/50 bg-card px-4 py-3 text-sm shadow-xl shadow-foreground/10"
    >
      <p className="min-w-0 flex-1">
        Your session ended. Your work in this tab is kept.
      </p>

      <Link href={signInHref} className={buttonVariants({ size: "sm" })}>
        Sign in again
      </Link>

      <Button
        size="sm"
        variant="ghost"
        iconOnly
        aria-label="Dismiss"
        onClick={dismiss}
      >
        <CloseIcon />
      </Button>
    </div>
  );
}
