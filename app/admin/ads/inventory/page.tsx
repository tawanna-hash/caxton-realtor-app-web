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
      const [s, c, p] = await Promise.all([
        adminApi.listAdSpaces() as Promise<{ spaces: AdSpace[] }>,
        adminApi.listAdCreatives() as Promise<{ creatives: AdCreative[] }>,
        adminApi.listAdCampaigns() as Promise<{ campaigns: AdCampaign[] }>,
      ]);
      setSpaces(s.spaces);
      setCreatives(c.creatives);
      setCampaigns(p.campaigns);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // refetch updates loading/error/data state; required on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refetch();
  }, [refetch]);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="text-xs text-gray-700 uppercase tracking-wide">
            <Link href="/admin/ads" className="hover:underline">Ads</Link>
            <span className="mx-2" aria-hidden>{'\u203A'}</span>
            Inventory
          </div>
          <PageTitle size="md">Inventory</PageTitle>
          <p className="text-sm text-gray-700 mt-1">
            Ad slots across all publications. Manage inventory and creatives.{' '}
            <Link href="/admin/ads/orders" className="text-blue-700 hover:underline">
              Open pipeline →
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/ads/placements"
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Placements
          </Link>
          <Link
            href="/admin/ads/campaigns/new"
            className="rounded-md bg-brand-700 px-4 py-2 text-white text-sm font-medium hover:bg-brand-800"
          >
            + New campaign
          </Link>
        </div>
      </div>

      <AdsTabs
        current={tab}
        catalogCount={spaces.length}
        creativesCount={creatives.length}
      />

      <div className="mt-6">
        {loading && <p className="text-gray-700">Loading…</p>}
        {error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
            {error}
          </div>
        )}
        {!loading && !error && (
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
    <Suspense fallback={<div className="p-6 text-gray-700">Loading…</div>}>
      <AdsPageInner />
    </Suspense>
  );
}
