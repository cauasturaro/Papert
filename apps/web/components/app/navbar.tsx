import Link from "next/link";
import type { ReactNode } from "react";
import { PapertMark } from "@/components/icons";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { cn } from "@/lib/utils";
import { UserMenu } from "./user-menu";

type NavbarProps = {
  /** Page-specific content between the brand and the global controls. */
  children?: ReactNode;
  /** Page-specific actions placed before the theme and account controls. */
  actions?: ReactNode;
  className?: string;
};

export function Navbar({ children, actions, className }: NavbarProps) {
  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70",
        className,
      )}
    >
      <Link
        href="/"
        className="flex shrink-0 items-center gap-2 rounded-sm font-semibold tracking-tight"
      >
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <PapertMark className="size-4" />
        </span>
        <span className="max-sm:sr-only">Papert</span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>

      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
