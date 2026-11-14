"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button/button";
import { ErrorPanel } from "@/components/ui/error-panel/error-panel";
import { errorKind, toLearnerMessage } from "@/lib/api/learner-error";
import { signInHref } from "@/lib/auth/session-signal";

/** A failed page load: signed-out learners get a sign-in link back here, others a retry. */
export function LoadErrorAlert({
  error,
  title,
  signedOutTitle = "Sign in to explore",
  onRetry,
}: {
  error: Error;
  title: string;
  signedOutTitle?: string;
  onRetry: () => void;
}) {
  const pathname = usePathname();
  const signedOut = errorKind(error) === "session_expired";

  if (signedOut) {
    const search = typeof window === "undefined" ? "" : window.location.search;
    const href = signInHref(`${pathname}${search}`);

    return (
      <ErrorPanel
        className="rounded-lg border border-border bg-card"
        title={signedOutTitle}
        message="Sign in to continue. You will come back to this page afterwards."
        actions={
          <Link href={href} className={buttonVariants({ size: "sm" })}>
            Go to sign in
          </Link>
        }
      />
    );
  }

  return (
    <ErrorPanel
      className="rounded-lg border border-border bg-card"
      title={title}
      message={toLearnerMessage(error)}
      onRetry={onRetry}
    />
  );
}
