// Availability calendar — month-grid view of every booked window across
// the three channels. Digital reads from ad_campaigns; print + email read
// from agreements.

'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import AvailabilityCalendar from './_components/AvailabilityCalendar';
import { AD_OPS_PRIMARY, AD_OPS_SECONDARY } from '../_components/AdOpsUi';

import PageTitle from '@/components/ui/PageTitle';
export const dynamic = 'force-dynamic';

export default function AdminAdsAvailabilityPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Ad Ops</div>
          <PageTitle size="md">Availability</PageTitle>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Review booked windows by channel and open the source order or campaign.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/ads/placements" className={AD_OPS_SECONDARY}>Placements</Link>
          <Link href="/admin/ads/campaigns/new" className={AD_OPS_PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New campaign
          </Link>
        </div>
      </header>
      <Suspense fallback={<div className="text-sm text-gray-600">Loading calendar…</div>}>
        <AvailabilityCalendar />
      </Suspense>
    </div>
  );
}
