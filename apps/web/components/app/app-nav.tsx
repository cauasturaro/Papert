"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/study", label: "Study" },
  { href: "/community", label: "Community" },
  { href: "/library", label: "Library" },
  { href: "/memory", label: "Memory" },
];

/** Product sections for pages outside the study workspace. */
export function AppNav() {
  // Dynamic routes resolve the path at request time; the links render without a highlight first.
  return (
    <Suspense fallback={<NavLinks pathname="" />}>
      <CurrentNavLinks />
    </Suspense>
  );
}

function CurrentNavLinks() {
  const pathname = usePathname();

  return <NavLinks pathname={pathname} />;
}

function NavLinks({ pathname }: { pathname: string }) {
  const nav = useRef<HTMLElement>(null);
  const activeLink = useRef<HTMLAnchorElement>(null);

  // On narrow screens the current section may sit past the visible edge of the scroller,
  // and the nav narrows again once the account controls load.
  useEffect(() => {
    const scroller = nav.current;
    const link = activeLink.current;

    if (!scroller || !link) {
      return;
    }

    const observer = new ResizeObserver(() => {
      link.scrollIntoView({ block: "nearest", inline: "nearest" });
    });

    observer.observe(scroller);

    return () => observer.disconnect();
  }, [pathname]);

  return (
    // Narrow screens scroll the links sideways instead of pushing the account controls out.
    <nav
      ref={nav}
      aria-label="Main"
      className="flex min-w-0 items-center gap-1 overflow-x-auto p-1 [scrollbar-width:none]"
    >
      {LINKS.map((link) => {
        const active =
          pathname === link.href || pathname.startsWith(`${link.href}/`);

        return (
          <Link
            key={link.href}
            href={link.href}
            ref={active ? activeLink : undefined}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active && "bg-accent font-medium text-foreground",
            )}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
