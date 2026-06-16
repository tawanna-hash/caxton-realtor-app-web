import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PostHogProvider } from "./posthog-provider";

export const metadata: Metadata = {
  title: "Realty News Now | RealtyLine · Newsline San Antonio",
  description: "Free REALTOR® app for Texas real estate professionals",
  applicationName: "Realty News Now",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Realty News",
    // 'default' keeps the iOS status bar opaque and ABOVE the app content,
    // so the splash + publication picker don't render under the notch.
    // 'black-translucent' requires per-screen safe-area-inset handling we
    // don't have, and made the app look blank in WebClip standalone mode.
    statusBarStyle: "default",
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
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
