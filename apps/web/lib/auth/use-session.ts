"use client";

import { useEffect, useRef, useState } from "react";

export type User = { id: string; email: string };

/**
 * Owns the signed-in user: initial check, periodic refresh, focus re-check and
 * sign-out. Credential forms build on it through `beginAuthChange`.
 */
export function useSession() {
  const authVersion = useRef(0);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkSession(refresh = false) {
      const version = authVersion.current;

      try {
        const response = await fetch(
          `/api/auth/${refresh ? "refresh" : "me"}`,
          {
            method: refresh ? "POST" : "GET",
            cache: "no-store",
            headers: refresh ? { "Content-Type": "application/json" } : {},
            body: refresh ? "{}" : undefined,
          },
        );
        const data = await response.json();

        // Login/logout invalidates checks started under an earlier session state.
        if (!mounted || version !== authVersion.current) {
          return;
        }

        if (response.ok) {
          setUser(data.user);
          setMessage("");
        } else if (response.status === 401) {
          setUser(null);
          setMessage(
            "Please sign in to continue. If your session expired, sign in again to return here.",
          );
        } else {
          setMessage("We could not check your session. Please try again.");
        }
      } catch {
        if (mounted && version === authVersion.current) {
          setMessage("The service is unavailable. Please try again.");
        }
      } finally {
        if (mounted && version === authVersion.current) {
          setLoading(false);
        }
      }
    }

    void checkSession();

    // shortcut: simultaneous tab renewals can require signing in again; coordinate tabs if needed.
    const timer = window.setInterval(
      () => void checkSession(true),
      10 * 60 * 1000,
    );
    const onFocus = () => void checkSession();
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  // Invalidates in-flight session checks while credentials change.
  function beginAuthChange() {
    authVersion.current += 1;
  }

  async function logout() {
    beginAuthChange();
    setSigningOut(true);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      if (response.ok || response.status === 401) {
        setUser(null);
        setMessage("You are signed out.");
      } else {
        setMessage("We could not sign you out. Please try again.");
      }
    } catch {
      setMessage("We could not sign you out. Please try again.");
    } finally {
      beginAuthChange();
      setSigningOut(false);
    }
  }

  return {
    user,
    setUser,
    loading,
    signingOut,
    message,
    setMessage,
    beginAuthChange,
    logout,
  };
}
