// caxton-ads-v1
// Edit-campaign route. Fetches the campaign client-side, passes to
// CampaignForm in edit mode.

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import { CampaignForm } from '../../_components/CampaignForm';
import type { AdCampaign } from '../../_components/types';

import PageTitle from '@/components/ui/PageTitle';
export default function EditCampaignPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [campaign, setCampaign] = useState<AdCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminApi.listAdCampaigns()
      .then((r) => {
        const found = (r as { campaigns: AdCampaign[] }).campaigns.find((c) => c.id === id);
        if (!found) {
          setError('Campaign not found');
        } else {
          setCampaign(found);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Load failed'));
  }, [id]);

  if (error) return <div className="p-6 text-red-700">{error}</div>;
  if (!campaign) return <div className="p-6 text-gray-700">Loading campaign...</div>;

  return (
    <div className="p-6">
      <div className="mb-6">
        <PageTitle size="md">Edit campaign</PageTitle>
        <p className="text-sm text-gray-700 mt-1">
          {campaign.advertiser_name} — {campaign.ad_space.display_name}
        </p>
      </div>
      <CampaignForm initial={campaign} />
    </div>
  );
}
