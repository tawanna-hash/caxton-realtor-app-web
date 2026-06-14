// Unified orders pipeline — campaigns (digital self-serve) + agreements
// (print/email/multi-channel) on one screen, tagged by channel.

'use client';

import { Suspense } from 'react';
import OrdersTable from './_components/OrdersTable';

export const dynamic = 'force-dynamic';

export default function AdminAdsOrdersPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Ad orders</h1>
        <p className="text-sm text-gray-700 mt-1">
          Every booked Print, Digital, and Email order in one pipeline.
          Self-serve checkouts land as campaigns; admin-drafted print/email
          orders land as agreements. Click a row to open the underlying record.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-gray-600">Loading orders…</div>}>
        <OrdersTable />
      </Suspense>
    </div>
  );
}
