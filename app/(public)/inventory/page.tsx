// app/(public)/inventory/page.tsx
//
// Public listing page for builder inventory & promotions.
// Server component: fetches all status='active' rows and passes them to the
// client component, which handles publication filtering (from localStorage)
// and kind filtering (from URL query params).

import {
  listBuilderInventory,
  listActiveBuilderNames,
} from '@/lib/builder-inventory';
import InventoryClient from '@/components/inventory/InventoryClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Builder Inventory & Promotions — Realty News Now',
  description:
    'New home listings, quick move-ins, and limited-time promotions from Austin and San Antonio builders and developers.',
};

export default async function Page() {
  // listBuilderInventory caps at 500 rows; the by-builder chip strip must
  // reflect every builder with active inventory regardless of that cap, so
  // fetch the distinct builder names separately.
  const [rows, allBuilders] = await Promise.all([
    listBuilderInventory({ status: 'active', limit: 500 }),
    listActiveBuilderNames('all'),
  ]);
  return <InventoryClient initialRows={rows} allBuilders={allBuilders} />;
}
