import type { Metadata } from "next";
import Link from "next/link";
import { AppNav } from "@/components/app/app-nav";
import { Navbar } from "@/components/app/navbar";
import { ChevronRightIcon, PapertMark } from "@/components/icons";
import { buttonVariants } from "@/components/ui/button/button";

export const metadata: Metadata = {
  title: "Page not found · Papert",
};

const destinations = [
  {
    href: "/study",
    title: "Study",
    description: "Resume a roadmap or create a new one.",
  },
  {
    href: "/community",
    title: "Community",
    description: "Browse roadmaps published by other learners.",
  },
  {
    href: "/library",
    title: "Library",
    description: "Find the roadmaps you saved.",
  },
];

export default function NotFound() {
  return (
    <>
      <Navbar>
        <AppNav />
      </Navbar>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center"
      >
        <div className="mx-auto grid w-full max-w-5xl gap-12 px-6 py-16 md:grid-cols-[1.2fr_1fr] md:items-center md:py-24">
          <div className="flex flex-col gap-5">
            <p className="font-mono text-sm font-medium text-muted-foreground">
              Error 404
            </p>

            <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Page not found
            </h1>
            <p className="max-w-md text-lg text-muted-foreground">
              The page you requested does not exist or is no longer available.
              Check the address or continue from one of the links below.
            </p>

            <div className="flex flex-wrap gap-3 pt-2">
              <Link href="/" className={buttonVariants({ size: "lg" })}>
                Back to home
              </Link>
              <Link
                href="/study"
                className={buttonVariants({ size: "lg", variant: "outline" })}
              >
                Open your study space
              </Link>
            </div>
          </div>

          <nav aria-labelledby="destinations-title">
            <h2
              id="destinations-title"
              className="mb-3 text-sm font-medium text-muted-foreground"
            >
              Where to go next
            </h2>

            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
              {destinations.map(({ href, title, description }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-accent focus-visible:-outline-offset-4"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium">{title}</span>
                      <span className="text-sm text-muted-foreground">
                        {description}
                      </span>
                    </span>

                    <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-muted-foreground">
          <span className="flex items-center gap-2 font-medium text-foreground">
            <PapertMark className="size-4" />
            Papert
          </span>
          <span>Learn by building.</span>
        </div>
      </footer>
    </>
  );
}
