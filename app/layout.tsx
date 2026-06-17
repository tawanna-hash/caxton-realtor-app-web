import type { Metadata } from "next";
import "./globals.css";
import { PostHogProvider } from "./posthog-provider";

const SITE_URL = "https://realtynewsnow.app";
const SITE_NAME = "Realty News Now";
const SITE_DESCRIPTION =
  "Free REALTOR® app for Texas real estate professionals — daily news, event calendars, rate cards, and pro tools for RealtyLine (Austin), Newsline (San Antonio), Houston, and Dallas.";

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
    "REALTOR® tools",
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
  },
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
