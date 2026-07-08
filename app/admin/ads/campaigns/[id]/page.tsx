// caxton-ads-v1
// Edit-campaign route. Fetches the campaign client-side, passes to
// CampaignForm in edit mode.

'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { adminApi } from '@/lib/admin-api';
import { CampaignForm } from '../../_components/CampaignForm';
import type { AdCampaign } from '../../_components/types';

import PageTitle from '@/components/ui/PageTitle';
export default function EditCampaignPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const [campaign, setCampaign] = useState<AdCampaign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  async function handleDelete() {
    if (!campaign) return;
    const ok = window.confirm(
      `Delete campaign "${campaign.advertiser_name}" (${campaign.ad_space.display_name})?\n\nThis cannot be undone.`,
    );
    if (!ok) return;
    setDeleting(true);
    try {
      await adminApi.deleteAdCampaign(id);
      router.push('/admin/ads/campaigns');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      setDeleting(false);
    }
  }

  if (error) return <div className="p-6 text-red-700">{error}</div>;
  if (!campaign) return <div className="p-6 text-gray-700">Loading campaign...</div>;

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <PageTitle size="md">Edit campaign</PageTitle>
          <p className="text-sm text-gray-700 mt-1">
            {campaign.advertiser_name} — {campaign.ad_space.display_name}
          </p>
        </div>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? 'Deleting…' : 'Delete campaign'}
        </button>
      </div>
      <CampaignForm initial={campaign} />
    </div>
  );
}
