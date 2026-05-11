"use client";

import { useEffect } from "react";
import posthog from "posthog-js";

let initialized = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (initialized) return;
    if (typeof window === "undefined") return;
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";
    if (!key) {
      console.warn("[PostHog] NEXT_PUBLIC_POSTHOG_KEY not set; analytics disabled");
      return;
    }
    posthog.init(key, {
      api_host: host,
      capture_pageview: false,
      capture_pageleave: true,
      session_recording: {
        maskAllInputs: true,
      },
      loaded: (ph) => {
        if (process.env.NODE_ENV === "development") {
          ph.debug();
        }
      },
    });
    initialized = true;
  }, []);

  return <>{children}</>;
}

export function identifyUser(userId: string | null, traits?: Record<string, any>) {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  if (userId) {
    posthog.identify(userId, traits);
  } else {
    posthog.reset();
  }
}

export function trackEvent(event: string, properties?: Record<string, any>) {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  posthog.capture(event, properties);
}
