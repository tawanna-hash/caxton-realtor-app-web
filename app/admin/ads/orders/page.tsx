// Unified orders pipeline — campaigns (digital self-serve) + agreements
// (print/email/multi-channel) on one screen, tagged by channel.
// Now also hosts IO and Tearsheet views via the ?view= param.

import { Suspense } from 'react';
import PageTitle from '@/components/ui/PageTitle';
import OrdersPageClient from './_components/OrdersPageClient';

export const dynamic = 'force-dynamic';

export default function AdminAdsOrdersPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <PageTitle size="md">Ad orders</PageTitle>
        <p className="text-sm text-gray-700 mt-1">
          Every booked Print, Digital, Email, and App order in one pipeline —
          plus insertion orders and tearsheets. Switch views below.
        </p>
      </div>
      <Suspense fallback={<div className="text-sm text-gray-600">Loading…</div>}>
        <OrdersPageClient />
      </Suspense>
    </div>
  );
}
