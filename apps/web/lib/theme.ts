export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const themeStorageKey = "papert:theme";
export const themeChangeEvent = "papert:theme-change";

const darkQuery = "(prefers-color-scheme: dark)";

function isPreference(value: unknown): value is ThemePreference {
  return value === "system" || value === "light" || value === "dark";
}

export function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(themeStorageKey);

    return isPreference(stored) ? stored : "system";
  } catch {
    // Storage can be blocked (private mode, site data disabled).
    return "system";
  }
}

export function storePreference(preference: ThemePreference) {
  try {
    if (preference === "system") {
      localStorage.removeItem(themeStorageKey);
    } else {
      localStorage.setItem(themeStorageKey, preference);
    }
  } catch {
    // The choice still applies to this page view.
  }
}

export function systemTheme(): ResolvedTheme {
  return window.matchMedia(darkQuery).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

export function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
}

export function subscribeToSystemTheme(listener: () => void) {
  const query = window.matchMedia(darkQuery);
  query.addEventListener("change", listener);

  return () => query.removeEventListener("change", listener);
}

/**
 * Runs inline in <head> before the first paint, so it cannot import anything.
 * Keep the storage key and media query in sync with the functions above.
 */
export const themeBootScript = `(() => {
  let preference = "system";
  try {
    preference = localStorage.getItem("${themeStorageKey}") || "system";
  } catch {}
  const dark =
    preference === "dark" ||
    (preference !== "light" && window.matchMedia("${darkQuery}").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
})();`;
