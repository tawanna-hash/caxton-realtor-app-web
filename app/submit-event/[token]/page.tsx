/**
 * Public advertiser event-submission page (no auth, gated by the token in
 * the URL). Admins generate one of these links per advertiser from the CRM.
 *
 * Visual matches the Realty News Now brand language used elsewhere:
 *   - Serif Georgia headings, sans-serif body
 *   - Brand navy primary action
 *   - Compact card on a soft background, mobile-first
 */

import { Suspense } from 'react';
import SubmitEventClient from './SubmitEventClient';

export const metadata = {
  title: 'Submit an event — Realty News Now',
  description:
    'Submit your event for inclusion on the Realty News Now Calendar.',
};

// Force dynamic so the token lookup hits the API at request time.
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export default async function SubmitEventPage({ params }: Ctx) {
  const { token } = await params;
  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <Suspense fallback={<p className="text-gray-500">Loading…</p>}>
          <SubmitEventClient token={token} />
        </Suspense>
      </div>
    </main>
  );
}
