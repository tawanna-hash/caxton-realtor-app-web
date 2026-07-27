"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { usePathname } from "next/navigation";
import { installActivityTracker } from "@/lib/activity-tracker";

let initialized = false;

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

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
      autocapture: true,
      // crossorigin='anonymous' on the recorder/loader scripts so the
      // browser unmasks any error they throw. Without this, errors from
      // PostHog-loaded scripts hit window.onerror as the literal string
      // 'Script error.' with no stack and no message — which is what was
      // landing in the /admin/activity alert email.
      cross_subdomain_cookie: false,
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
    // Wire global error + form-submit capture for /admin/activity dashboard.
    // No-ops on admin pages and rate-limits itself per page load.
    installActivityTracker();
    // S19 one-time migration: legacy 'savedPub' -> 'caxton_pub'.
    // Runs once per browser; no-op afterwards.
    try {
      if (!window.localStorage.getItem('caxton_pub')) {
        const legacy = window.localStorage.getItem('savedPub');
        if (legacy) {
          const normalized =
            legacy === 'realtyline' || legacy === 'RealtyLine' ? 'realtyline' :
            legacy === 'newsline' || legacy === 'Newsline' || legacy === 'Newsline San Antonio' ? 'newsline' : null;
          if (normalized) {
            window.localStorage.setItem('caxton_pub', normalized);
          }
        }
      }
      window.localStorage.removeItem('savedPub');
    } catch {
      // localStorage unavailable; ignore
    }
    registerActivePublication();
    const onPubChange = () => registerActivePublication();
    window.addEventListener('savedPubChange', onPubChange);
    window.addEventListener('storage', (e) => {
      if (e.key === 'caxton_pub') registerActivePublication();
    });
  }, []);

  useEffect(() => {
    if (!initialized) return;
    posthog.capture('$pageview', {
      $current_url: window.location.href,
    });
  }, [pathname]);

  return <>{children}</>;
}

export function identifyUser(userId: string | null, traits?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  if (userId) {
    posthog.identify(userId, traits);
  } else {
    posthog.reset();
  }
}

export function trackEvent(event: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  if (!initialized) return;
  posthog.capture(event, properties);
}

const PUB_STORAGE_KEY = 'caxton_pub';

export function registerActivePublication(): void {
  if (typeof window === 'undefined') return;
  if (!initialized) return;

  if (window.location.hostname.endsWith('realtynewsnow.app')) {
    posthog.register({ publication: 'realtynewsnow' });
    return;
  }

  const saved = window.localStorage.getItem(PUB_STORAGE_KEY);
  if (saved === 'realtyline' || saved === 'newsline') {
    posthog.register({ publication: saved });
  } else {
    posthog.register({ publication: 'unknown' });
  }
}
