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
  // Home-screen icon / PWA support removed 2026-06-16.
  // iOS WebClip standalone mode kept caching a broken response across re-adds
  // and Safari refused to drop it short of a full device restart. Plan: ship
  // a real native iOS app via Capacitor for the home-screen experience.
  // Until then this is a regular web app accessed via Safari URL/bookmark.
};

export const viewport: Viewport = {
  themeColor: "#021D40",
  width: "device-width",
  initialScale: 1,
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
