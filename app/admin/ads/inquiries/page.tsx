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

export const dynamic = 'force-dynamic';

export default function AdminAdsInquiriesPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Ad inquiries</h1>
        <p className="text-sm text-gray-700 mt-1">
          Every Print, Digital, and Email lead from{' '}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">/advertise/inquire</code>.
          Reply, assign, takeover into manual booking, or mark won/lost.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-gray-600">Loading inbox…</div>}>
        <InquiriesInbox />
      </Suspense>
    </div>
  );
}
