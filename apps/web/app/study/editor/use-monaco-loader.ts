"use client";

import { useEffect, useState } from "react";
import { loadMonaco, monacoLoaded } from "./monaco-loader";

export function useMonacoLoader() {
  const [ready, setReady] = useState(monacoLoaded);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (ready) {
      return;
    }

    let active = true;

    loadMonaco()
      .then(() => {
        if (active) {
          setReady(true);
        }
      })
      .catch(() => {
        if (active) {
          setError("The code editor could not load.");
        }
      });

    return () => {
      active = false;
    };
  }, [ready, attempt]);

  function retry() {
    setError("");
    setAttempt((count) => count + 1);
  }

  return { ready, error, retry };
}
