import type { ReactNode } from "react";
import { AppNav } from "@/components/app/app-nav";
import { Navbar } from "@/components/app/navbar";

/** Navbar and scrolling page body shared by pages outside the study workspace. */
export function PageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar>
        <AppNav />
      </Navbar>

      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 justify-center bg-muted/40 px-4 py-6 sm:px-6"
      >
        <div className="flex w-full max-w-6xl flex-col gap-6">{children}</div>
      </main>
    </>
  );
}
