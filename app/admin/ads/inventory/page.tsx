// /admin/ads/inventory
// Inventory-focused view: Catalog (slots) and Creatives.
// Pipeline of campaigns + agreements lives at /admin/ads/orders.
// The /admin/ads root is the Ad Hub (KPIs + section cards).

'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import { AdsTabs, type AdTab } from '../_components/AdsTabs';
import { CatalogList } from '../_components/CatalogList';
import { CreativesGallery } from '../_components/CreativesGallery';
import type { AdSpace, AdCreative, AdCampaign } from '../_components/types';
import { isCampaignActive } from '../_components/types';
import { AdOpsMetrics, AD_OPS_PRIMARY, AD_OPS_SECONDARY } from '../_components/AdOpsUi';
import { Plus } from 'lucide-react';

import PageTitle from '@/components/ui/PageTitle';
export const dynamic = 'force-dynamic';

function AdsPageInner() {
  const params = useSearchParams();
  const rawTab = params.get('tab');
  // Legacy ?tab=campaigns redirects users to /admin/ads/orders via the
  // "Open pipeline" link; for the in-page tab state we just fall back to
  // catalog so the tab bar always has a valid selection.
  const tab: AdTab =
    rawTab === 'creatives' ? 'creatives' : 'catalog';

  const [spaces, setSpaces] = useState<AdSpace[]>([]);
  const [creatives, setCreatives] = useState<AdCreative[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    try {
      setLoading(true);
      const [s, c, p] = await Promise.allSettled([
        adminApi.listAdSpaces() as Promise<{ spaces: AdSpace[] }>,
        adminApi.listAdCreatives() as Promise<{ creatives: AdCreative[] }>,
        adminApi.listAdCampaigns() as Promise<{ campaigns: AdCampaign[] }>,
      ]);
      if (s.status === 'fulfilled') setSpaces(s.value.spaces);
      if (c.status === 'fulfilled') setCreatives(c.value.creatives);
      if (p.status === 'fulfilled') setCampaigns(p.value.campaigns);
      const failed = [
        s.status === 'rejected' ? 'inventory' : null,
        c.status === 'rejected' ? 'creatives' : null,
        p.status === 'rejected' ? 'campaigns' : null,
      ].filter(Boolean);
      setError(failed.length ? `Could not refresh ${failed.join(', ')}. Showing the data that is available.` : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">
            Admin · Ad Ops
          </div>
          <PageTitle size="md">Inventory</PageTitle>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Manage ad slots and creative assets across every publication.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/ads/placements"
            className={AD_OPS_SECONDARY}
          >
            Placements
          </Link>
          <Link
            href="/admin/ads/campaigns/new"
            className={AD_OPS_PRIMARY}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            New campaign
          </Link>
        </div>
      </header>

      <AdOpsMetrics
        label="Inventory summary"
        items={[
          { label: 'Placements', value: spaces.length },
          { label: 'Live campaigns', value: campaigns.filter(isCampaignActive).length },
          { label: 'Creative assets', value: creatives.length },
          { label: 'Open pipeline', value: campaigns.length, detail: 'all campaigns' },
        ]}
      />

      <AdsTabs
        current={tab}
        catalogCount={spaces.length}
        creativesCount={creatives.length}
      />

      <div>
        {loading && spaces.length === 0 && (
          <div className="rounded border border-gray-200 bg-white p-8 text-sm text-gray-600 shadow-sm">
            Loading inventory…
          </div>
        )}
        {error && (
          <div role="alert" className="mb-3 flex flex-wrap items-center gap-3 rounded border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900">
            <span>{error}</span>
            <button type="button" onClick={refetch} className="font-semibold text-orange-800 hover:underline">
              Try again
            </button>
          </div>
        )}
        {(!loading || spaces.length > 0 || creatives.length > 0) && (
          <>
            {tab === 'catalog' && <CatalogList spaces={spaces} campaigns={campaigns} />}
            {tab === 'creatives' && <CreativesGallery creatives={creatives} campaigns={campaigns} onChange={refetch} />}
          </>
        )}
      </div>
    </div>
  );
}

export default function AdsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1500px] px-5 py-7 text-sm text-gray-600 lg:px-8">Loading inventory…</div>}>
      <AdsPageInner />
    </Suspense>
  );
}
