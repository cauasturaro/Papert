import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/components/app/query-provider";
import { SessionExpiredBanner } from "@/components/app/session-expired-banner";
import { SessionProvider } from "@/components/app/session-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { AnnouncementRegion } from "@/lib/a11y/announcement-region";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // Child routes set a plain title, such as "Study", and get "Study · Papert".
  title: {
    template: "%s · Papert",
    default: "Papert",
  },
  description: "Learn software development by building with Papert.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script sets data-theme before hydration.
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          {/* One query cache for study, community and library, kept across navigations. */}
          <QueryProvider>{children}</QueryProvider>
          <SessionExpiredBanner />
        </SessionProvider>

        <AnnouncementRegion />
      </body>
    </html>
  );
}
