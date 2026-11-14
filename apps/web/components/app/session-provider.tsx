"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSession } from "@/lib/auth/use-session";

type Session = ReturnType<typeof useSession>;

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const session = useSession();

  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSessionContext() {
  const session = useContext(SessionContext);

  if (!session) {
    throw new Error("useSessionContext must be used inside SessionProvider.");
  }

  return session;
}
