// app/(public)/communities/page.tsx
//
// Public listing page for builder & developer community summaries.
// Shows aggregated community-level rows (the pre-S13 design) — used for
// builders whose APIs only expose community-level data (KB Home, plus
// legacy DW/MI community rows kept for backward compat).
//
// Per-home inventory (specific homes with addresses) lives at /inventory.

import { listBuilderInventory } from '@/lib/builder-inventory';
import CommunitiesClient from '@/components/communities/CommunitiesClient';
import BuildersBreadcrumb from '@/components/BuildersBreadcrumb';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Builder & Developer Communities — Realty News Now',
  description:
    'New home communities and master-planned developments from Austin and San Antonio builders and developers.',
};

export default async function Page() {
  const rows = await listBuilderInventory({
    status: 'active',
    homeType: 'community',
    limit: 200,
  });
  return (
    <>
      <BuildersBreadcrumb />
      <CommunitiesClient initialRows={rows} />
    </>
  );
}
