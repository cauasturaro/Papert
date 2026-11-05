"use client";

import Link from "next/link";
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
import { useSessionContext } from "./session-provider";

export function UserMenu() {
  const { user, loading, signingOut, logout } = useSessionContext();

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <Link href="/account" className={buttonVariants({ size: "sm" })}>
        Sign in
      </Link>
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
        <DropdownMenuSeparator />

        <DropdownMenuItem disabled={signingOut} onSelect={() => void logout()}>
          {signingOut ? "Signing out…" : "Sign out"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
