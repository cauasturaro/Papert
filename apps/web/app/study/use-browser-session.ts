import { useEffect, useRef, useState } from "react";

/** Tracks the browser's connection so saves pause while offline. */
export function useOnline() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);

    updateConnection();
    window.addEventListener("online", updateConnection);
    window.addEventListener("offline", updateConnection);

    return () => {
      window.removeEventListener("online", updateConnection);
      window.removeEventListener("offline", updateConnection);
    };
  }, []);

  return online;
}

/** Asks for confirmation before the tab closes while edits are unsaved. */
export function useLeaveWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) {
      return;
    }

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);

    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** False once the component unmounts, so late save responses skip state updates. */
export function useMounted() {
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  return mounted;
}

/**
 * Whether a CSS media query matches. Reads it during the first render, so use it only in
 * trees that render on the client (the study IDE appears after its data loads).
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches,
  );

  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setMatches(list.matches);

    update();
    list.addEventListener("change", update);

    return () => list.removeEventListener("change", update);
  }, [query]);

  return matches;
}
