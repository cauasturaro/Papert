"use client";

import Link from "next/link";
import { useSessionContext } from "@/components/app/session-provider";
import { buttonVariants } from "@/components/ui/button/button";

/** Landing calls to action; the account link only appears to signed-out visitors. */
export function HeroActions() {
  const { user, loading } = useSessionContext();

  // Waiting for the session avoids flashing the sign-in link at someone already signed in.
  const signedOut = !loading && !user;

  return (
    <div className="flex flex-wrap gap-3">
      <Link className={buttonVariants({ size: "lg" })} href="/study">
        Open your study space
      </Link>

      {signedOut && (
        <Link
          className={buttonVariants({ size: "lg", variant: "outline" })}
          href="/account"
        >
          Sign in or create an account
        </Link>
      )}
    </div>
  );
}
