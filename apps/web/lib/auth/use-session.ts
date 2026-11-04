"use client";

import { useEffect, useRef, useState } from "react";
import {
  AuthRequestError,
  checkSession as requestSession,
  logout as requestLogout,
  type User,
} from "./auth-api";

export type { User } from "./auth-api";

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
        const data = await requestSession(refresh);

        // Login/logout invalidates checks started under an earlier session state.
        if (!mounted || version !== authVersion.current) {
          return;
        }

        setUser(data.user);
        setMessage("");
      } catch (error) {
        if (!mounted || version !== authVersion.current) {
          return;
        }

        if (error instanceof AuthRequestError && error.status === 401) {
          setUser(null);
        }

        setMessage(
          error instanceof AuthRequestError
            ? error.message
            : "The service is unavailable. Please try again.",
        );
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
      await requestLogout();

      setUser(null);
      setMessage("You are signed out.");
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
