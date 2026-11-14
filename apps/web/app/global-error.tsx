"use client";

import { useEffect } from "react";
import { Geist_Mono } from "next/font/google";
import { ThemeScript } from "@/components/theme/theme-script";
import { RouteErrorView } from "@/components/ui/error-panel/error-panel";
import { applyTheme, readPreference, resolveTheme } from "@/lib/theme";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Replaces the root layout when it fails, so it brings its own document, styles and theme.
export default function GlobalError({
  error,
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  // The head script only runs when this page is server-rendered; apply the theme on the client too.
  useEffect(() => {
    applyTheme(resolveTheme(readPreference()));
  }, []);

  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
        <title>Something went wrong · Papert</title>
      </head>

      <body className="flex min-h-full flex-col">
        <main className="flex flex-1 items-center">
          <RouteErrorView
            error={error}
            retry={retry}
            title="Papert could not load"
            message="Something went wrong on our side. Your saved work is kept on the server. Try again, or go back to the home page."
          />
        </main>
      </body>
    </html>
  );
}
