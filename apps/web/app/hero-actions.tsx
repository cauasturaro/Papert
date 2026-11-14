"use client";

import Link from "next/link";
import { useSessionContext } from "@/components/app/session-provider";
import { buttonVariants } from "@/components/ui/button/button";
import { cn } from "@/lib/utils";

const REGISTER_HREF = "/account?mode=register&next=/study";
const SIGN_IN_HREF = "/account?next=/study";

/** Landing calls to action: sign-up for visitors, the study space for learners. */
export function HeroActions() {
  const { user, loading } = useSessionContext();

  // Same size as the buttons, so the hero does not jump once the session is known.
  if (loading) {
    return (
      <div aria-hidden="true" className="flex flex-wrap gap-3">
        <span
          className={cn(
            buttonVariants({ size: "lg" }),
            "invisible w-44 select-none",
          )}
        />
      </div>
    );
  }

  if (user) {
    return (
      <div className="flex flex-wrap gap-3">
        <Link className={buttonVariants({ size: "lg" })} href="/study">
          Continue studying
        </Link>

        <Link
          className={buttonVariants({ size: "lg", variant: "outline" })}
          href="/community"
        >
          Explore community roadmaps
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link className={buttonVariants({ size: "lg" })} href={REGISTER_HREF}>
        Get started free
      </Link>

      <Link
        className={buttonVariants({ size: "lg", variant: "outline" })}
        href={SIGN_IN_HREF}
      >
        Sign in
      </Link>
    </div>
  );
}
