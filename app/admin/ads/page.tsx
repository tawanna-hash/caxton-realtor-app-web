// caxton-ads-v1
// Top-level /admin/ads page. Owns data fetch + renders the active tab.

'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import { AdsTabs, type AdTab } from './_components/AdsTabs';
import { CatalogList } from './_components/CatalogList';
import { CampaignsTable } from './_components/CampaignsTable';
import { CreativesGallery } from './_components/CreativesGallery';
import type { AdSpace, AdCreative, AdCampaign } from './_components/types';

export const dynamic = 'force-dynamic';

function AdsPageInner() {
  const params = useSearchParams();
  const tab = (params.get('tab') as AdTab) || 'catalog';

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
    refetch();
  }, [refetch]);

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ads dashboard</h1>
          <p className="text-sm text-gray-700 mt-1">
            15 ad slots across both publications. Manage campaigns and uploaded creatives.
          </p>
        </div>
        <Link
          href="/admin/ads/campaigns/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700"
        >
          + New campaign
        </Link>
      </div>

      <AdsTabs
        current={tab}
        catalogCount={spaces.length}
        campaignsCount={campaigns.length}
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
            {tab === 'campaigns' && <CampaignsTable campaigns={campaigns} onChange={refetch} />}
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
