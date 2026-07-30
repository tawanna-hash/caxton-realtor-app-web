import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "./posthog-provider";
import PushBootstrap from "@/components/PushBootstrap";
import NativeSplashBootstrap from "@/components/NativeSplashBootstrap";
import DeepLinkBootstrap from "@/components/DeepLinkBootstrap";
import BiometricGate from "@/components/BiometricGate";
import BiometricEnrollPrompt from "@/components/BiometricEnrollPrompt";
import NativeKeyboard from "@/components/NativeKeyboard";
import ExternalLinkInterceptor from "@/components/ExternalLinkInterceptor";
import NativeScrollToTop from "@/components/NativeScrollToTop";
import BackToTopButton from "@/components/BackToTopButton";
import AutoPrint from "@/components/AutoPrint";
import MarketOnboardingPicker from "@/components/MarketOnboardingPicker";
import { SpeedInsights } from "@vercel/speed-insights/next";

const SITE_URL = "https://realtynewsnow.app";
const SITE_NAME = "Realty News Now";
const SITE_DESCRIPTION =
  "Free REALTOR® app for Texas real estate professionals — daily news, event calendars, rate cards, and pro tools for RealtyLine (Austin), Newsline (San Antonio), Houston, and Dallas.";

// Body sans-serif for the whole app. Inter at weights 400/500/600/700 covers
// every UI surface: body, eyebrows, button labels, admin tables, portal nav.
// Display serif (Georgia) remains a system stack so we ship zero serif font
// weight from the network — matches the magazine page's intentional look.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-app",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | RealtyLine · Newsline San Antonio`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "Texas real estate",
    "Austin realtor",
    "San Antonio realtor",
    "Houston realtor",
    "Dallas realtor",
    "RealtyLine",
    "Newsline",
    "real estate magazine",
    "REALTOR\u00ae tools",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — Texas real estate, daily.`,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Texas real estate, daily.`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  // iOS uses apple-mobile-web-app-title for the Add-to-Home-Screen label.
  // Without this, iOS Safari falls back to the document <title> (or in some
  // cases an ancestor/cached value), which produced "Caxton Publications, Inc"
  // instead of "Realty News Now" on the install sheet.
  // capable: false launches the home-screen icon in regular Safari
  // instead of the iOS standalone WebView. See app/manifest.ts and PR
  // #144 for the full history — standalone WebView's isolated cookie
  // jar breaks the dashboard's auth bootstrap and surfaces as 'This
  // page couldn't load'. Title is still set so the install sheet shows
  // 'Realty News Now', not the document <title>.
  appleWebApp: {
    capable: false,
    title: "Realty News Now",
    statusBarStyle: "default",
  },
  verification: {
    google: "VntUQ3nLhhIJvbL5UFaiLV4-o5B0C3sYJ_tEPdaBd8s",
  },
};

// viewportFit="cover" is REQUIRED for env(safe-area-inset-*) to return real
// values on notched iPhones. Without it, env() returns 0 and any UI that
// claims to respect the safe area (BottomNav, FloaterPill, etc.) silently
// renders behind the home indicator on iPhone X+ devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#301D5D",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased font-sans">
        <PostHogProvider>
          <PushBootstrap />
          {/* Native iOS shell only: dismiss the Capacitor splash screen as
              soon as React has painted, instead of waiting for the 1500ms
              auto-hide timeout. No-op on web. */}
          <NativeSplashBootstrap />
          {/* Native iOS shell only: catch incoming Universal Link taps
              (e.g. magic-link emails) and route the WebView to the deep
              path so cold-launches don't strand users on the homepage. */}
          <DeepLinkBootstrap />
          <NativeKeyboard />
          <ExternalLinkInterceptor />
          <NativeScrollToTop />
          <BackToTopButton />
          <AutoPrint />
          {/* First-launch market picker. Shows once when caxton_pub isn't
              set yet (no cookie, no localStorage). Self-dismisses after a
              choice and stays hidden on every subsequent launch. */}
          <MarketOnboardingPicker />
          {children}
          {/* Native iOS shell only: opt-in Face ID / Touch ID lock that
              overlays the UI on cold launch and resume-from-background.
              No-op on web (renders nothing when isNative()===false). */}
          <BiometricGate />
          {/* One-time enroll prompt — appears only on native, only if the
              gate isn't already enabled, and only once per device. */}
          <BiometricEnrollPrompt />
        </PostHogProvider>
        {/* Vercel Speed Insights — collects real-user Core Web Vitals (LCP,
            CLS, INP, FCP, TTFB) and surfaces them in the Vercel dashboard.
            Loaded after the app tree so it never blocks initial render. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
