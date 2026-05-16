// app/(public)/inventory/page.tsx
//
// Public listing page for builder inventory & promotions.
// Server component: fetches all status='active' rows and passes them to the
// client component, which handles publication filtering (from localStorage)
// and kind filtering (from URL query params).

import { listBuilderInventory } from '@/lib/builder-inventory';
import InventoryClient from '@/components/inventory/InventoryClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Builder Inventory & Promotions — SnapNews24',
  description:
    'New home listings, quick move-ins, and limited-time promotions from Austin and San Antonio builders and developers.',
};

export default async function Page() {
  const rows = await listBuilderInventory({ status: 'active', limit: 200 });
  return <InventoryClient initialRows={rows} />;
}
