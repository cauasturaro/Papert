"use client";

import { useEffect, useRef, useState } from "react";
import {
  AuthRequestError,
  checkSession as requestSession,
  logout as requestLogout,
  type User,
} from "./auth-api";
import {
  markSignedIn,
  markSignedOut,
  reportUnauthorized,
} from "./session-signal";
import { readSessionWithRenewal, renewSession } from "./session-renewal";
import { adoptUserData, clearUserData } from "./user-data";

export type { User } from "./auth-api";

/**
 * Owns the signed-in user: initial check, periodic refresh, focus re-check and
 * sign-out. Credential forms build on it through `beginAuthChange`.
 */
export function useSession() {
  const authVersion = useRef(0);
  const [user, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkSession(refresh = false) {
      const version = authVersion.current;

      try {
        const read = () => requestSession(false);
        const renew = () => requestSession(true);

        // An idle tab's access token may have expired; the refresh cookie renews it once.
        const data = refresh
          ? await renewSession(renew, read)
          : await readSessionWithRenewal(read, renew);

        // Login/logout invalidates checks started under an earlier session state.
        if (!mounted || version !== authVersion.current) {
          return;
        }

        adoptUserData(data.user.id);
        setCurrentUser(data.user);
        setMessage("");
      } catch (error) {
        if (!mounted || version !== authVersion.current) {
          return;
        }

        // Being signed out is not an error; an ended session is reported by the global banner.
        if (error instanceof AuthRequestError && error.status === 401) {
          reportUnauthorized();
          setCurrentUser(null);
          setMessage("");

          return;
        }

        setMessage(
          error instanceof AuthRequestError
            ? error.message
            : "We could not check your session. Check your connection and try again.",
        );
      } finally {
        if (mounted && version === authVersion.current) {
          setLoading(false);
        }
      }
    }

    void checkSession();

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

  // Covers both session checks and credential forms that call `setUser`.
  useEffect(() => {
    if (user) {
      markSignedIn();
    }
  }, [user]);

  // Another account's cached data and drafts are dropped before its successor renders.
  function setUser(next: User | null) {
    if (next) {
      adoptUserData(next.id);
    }

    setCurrentUser(next);
  }

  // Invalidates in-flight session checks while credentials change.
  function beginAuthChange() {
    authVersion.current += 1;
  }

  async function logout() {
    beginAuthChange();
    setSigningOut(true);

    try {
      await requestLogout();

      markSignedOut();
      clearUserData();
      setCurrentUser(null);
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
