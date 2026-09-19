// Channel-aware admin inbox for ad inquiries.
//
// URL state:
//   /admin/ads/inquiries?channel=all|print|digital|email&status=new|...&q=...
//
// Data fetch happens client-side via /api/admin/ads/inquiries (already
// gated by requireAdmin). The list and the detail drawer share state so
// a status change in the drawer immediately refreshes the list + tab
// badges.

'use client';

import { Suspense } from 'react';
import InquiriesInbox from './_components/InquiriesInbox';

import PageTitle from '@/components/ui/PageTitle';
export const dynamic = 'force-dynamic';

export default function AdminAdsInquiriesPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Sales</div>
          <PageTitle size="md">Ad inquiries</PageTitle>
        <p className="text-sm text-gray-700 mt-1">
          Every Print, Digital, and Email lead from{' '}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-md">/advertise/inquire</code>.
          Reply, assign, takeover into manual booking, or mark won/lost.
        </p>
        </div>
      </div>
      <Suspense fallback={<div className="text-sm text-gray-600">Loading inbox…</div>}>
        <InquiriesInbox />
      </Suspense>
    </div>
  );
}
