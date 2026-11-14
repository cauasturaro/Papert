"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLink,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu/dropdown-menu";
import { UserIcon } from "@/components/icons";
import { signInHref } from "@/lib/auth/session-signal";
import { useSessionContext } from "./session-provider";

const SIGN_IN_CLASS = buttonVariants({ size: "sm" });

function SignInLink() {
  const pathname = usePathname();

  // Coming back from the landing or sign-in page itself goes to the study space.
  const href =
    pathname === "/" || pathname === "/account"
      ? "/account"
      : signInHref(pathname);

  return (
    <Link href={href} className={SIGN_IN_CLASS}>
      Sign in
    </Link>
  );
}

export function UserMenu() {
  const { user, loading, signingOut, logout } = useSessionContext();

  // Same footprint as the menu button, so the navbar does not shift once the session loads.
  if (loading) {
    return (
      <span
        aria-hidden="true"
        className="inline-block size-control-sm shrink-0 rounded-full bg-muted"
      />
    );
  }

  if (!user) {
    return (
      <Suspense
        fallback={
          <Link href="/account" className={SIGN_IN_CLASS}>
            Sign in
          </Link>
        }
      >
        <SignInLink />
      </Suspense>
    );
  }

  return (
    <DropdownMenu size="sm">
      <DropdownMenuTrigger
        variant="secondary"
        iconOnly
        className="rounded-full"
        aria-label={`Account menu for ${user.email}`}
      >
        <UserIcon />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuLink href="/study">Study space</DropdownMenuLink>
        <DropdownMenuLink href="/profile">Profile</DropdownMenuLink>
        <DropdownMenuSeparator />

        <DropdownMenuItem disabled={signingOut} onSelect={() => void logout()}>
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
