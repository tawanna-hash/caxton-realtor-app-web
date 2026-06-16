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
    statusBarStyle: "black-translucent",
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
  viewportFit: "cover",
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
