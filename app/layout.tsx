import type { Metadata } from "next";
import "./globals.css";
import { PostHogProvider } from "./posthog-provider";

export const metadata: Metadata = {
  title: "Caxton Publications | RealtyLine · Newsline San Antonio",
  description: "Free REALTOR® app for Texas real estate professionals",
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
