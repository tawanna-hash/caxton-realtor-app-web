import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./posthog-provider";

// Plus Jakarta Sans replaces Switzer (geometric sans-serif, visually close).
// Switzer was previously imported from fonts.cdnfonts.com which is behind a
// Cloudflare challenge and was taking 13-15s to load in tests. next/font/google
// self-hosts the woff2 files at build time so they ship from the same CDN as
// the rest of the app (Vercel edge) with <100ms cold-start latency.
const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-sans-app",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Realty News Now | RealtyLine · Newsline San Antonio",
  description: "Free REALTOR® app for Texas real estate professionals",
  applicationName: "Realty News Now",
  manifest: "/manifest.webmanifest",
  // appleWebApp.capable=true launches the home-screen icon in iOS standalone
  // WebView mode (no Safari chrome). On launch day we found that mode
  // briefly flashes the page then shows Safari's "This page couldn't load"
  // error -- a known iOS WebClip issue with full client-side React apps
  // that mount auth + storage logic on first paint.
  //
  // Until we can fully audit and harden the standalone codepath, leave
  // capable=false. The home-screen icon still works -- it just opens in
  // regular Safari (which loads the app correctly) instead of standalone.
  // We keep the apple-mobile-web-app-title so the icon label stays clean.
  appleWebApp: {
    capable: false,
    title: "Realty News",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  themeColor: "#021D40",
  width: "device-width",
  initialScale: 1,
  // No 'viewport-fit: cover' here — with statusBarStyle 'default' iOS keeps
  // the status bar above the app, and we don't need to extend content into
  // the notch area. Re-introduce with safe-area-inset padding if we ever
  // want an edge-to-edge look.
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <body className="antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
