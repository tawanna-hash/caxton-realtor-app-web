// app/admin/newsletter/page.tsx
//
// Server wrapper for the newsletter-subscribers admin page. The actual
// UI lives in NewsletterClient (a 'use client' file). This wrapper
// exists so the route can be marked force-dynamic — the client uses
// useSearchParams via useUrlState, which Next.js 15 refuses to
// statically prerender.

import { Suspense } from 'react';
import NewsletterClient from './NewsletterClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Admin · Newsletter Subscribers' };

export default function AdminNewsletterPage() {
  return (
    <Suspense fallback={null}>
      <NewsletterClient />
    </Suspense>
  );
}
