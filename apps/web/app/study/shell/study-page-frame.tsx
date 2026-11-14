"use client";

import type { ReactNode } from "react";
import { AppNav } from "@/components/app/app-nav";
import { Navbar } from "@/components/app/navbar";
import { useViewportLock } from "../workspace/use-viewport-lock";

/** Navbar and viewport-filling body shared by the study home, creator and draft pages. */
export function StudyPageFrame({ children }: { children: ReactNode }) {
  useViewportLock();

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <Navbar>
        <AppNav />
      </Navbar>

      {children}
    </div>
  );
}
