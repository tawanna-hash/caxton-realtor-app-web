// components/analytics/TrackPageView.tsx
//
// Reusable client component that fires a PostHog trackEvent on mount.
// Drop into server-rendered pages to add domain-specific page-view events
// without converting the entire page to a client component.
//
// Usage:
//   import TrackPageView from '@/components/analytics/TrackPageView';
//   <TrackPageView event="newsletter_page_viewed" />
//   <TrackPageView event="advertise_page_viewed" properties={{ channel: 'digital' }} />

'use client';

import { useEffect } from 'react';
import { trackEvent } from '@/app/posthog-provider';

interface TrackPageViewProps {
  event: string;
  properties?: Record<string, unknown>;
}

export default function TrackPageView({ event, properties }: TrackPageViewProps) {
  useEffect(() => {
    trackEvent(event, properties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
