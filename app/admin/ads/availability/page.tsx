// Availability calendar — month-grid view of every booked window across
// the three channels. Digital reads from ad_campaigns; print + email read
// from agreements.

'use client';

import { Suspense } from 'react';
import AvailabilityCalendar from './_components/AvailabilityCalendar';

export const dynamic = 'force-dynamic';

export default function AdminAdsAvailabilityPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Ad availability</h1>
        <p className="text-sm text-gray-700 mt-1">
          See what is booked at a glance. Switch channels to view digital slot
          windows, print issue months, or email send dates. Click any booking
          to open the order in Billing or the campaign editor.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-gray-600">Loading calendar…</div>}>
        <AvailabilityCalendar />
      </Suspense>
    </div>
  );
}
