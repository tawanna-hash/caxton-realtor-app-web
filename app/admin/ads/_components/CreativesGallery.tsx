// caxton-ads-v1
// Creatives tab — image grid showing every uploaded creative,
// with delete + "used in N" badge.

'use client';

import { useState } from 'react';
import { adminApi } from '@/lib/admin-api';
import type { AdCreative, AdCampaign } from './types';

interface Props {
  creatives: AdCreative[];
  campaigns: AdCampaign[];
  onChange: () => void;
}

export function CreativesGallery({ creatives, campaigns, onChange }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function usageCount(creativeId: string): number {
    return campaigns.filter((c) => c.creative_id === creativeId).length;
  }

  async function handleDelete(c: AdCreative) {
    const used = usageCount(c.id);
    if (used > 0) {
      alert(`Cannot delete — referenced by ${used} campaign(s). Delete those campaigns first.`);
      return;
    }
    if (!confirm(`Delete creative for ${c.advertiser_name}? This removes the image record (the file in Vercel Blob is not auto-deleted).`)) return;
    setBusyId(c.id);
    setError(null);
    try {
      await adminApi.deleteAdCreative(c.id);
      onChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setBusyId(null);
    }
  }

  if (creatives.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-md border border-gray-200">
        <p className="text-gray-700">No creatives uploaded yet.</p>
        <p className="text-sm text-gray-500 mt-1">
          Creatives are uploaded as part of the new-campaign flow.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {creatives.map((c) => {
          const used = usageCount(c.id);
          const busy = busyId === c.id;
          return (
            <div key={c.id} className="rounded-md border border-gray-200 bg-white overflow-hidden">
              <div className="aspect-[4/3] bg-gray-100 flex items-center justify-center">
                <img
                  src={c.blob_url}
                  alt={c.alt_text || c.advertiser_name}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
              <div className="p-3 text-sm">
                <p className="font-medium text-gray-900">{c.advertiser_name}</p>
                <p className="text-xs text-gray-600">{c.width}×{c.height}</p>
                <p className="text-xs text-gray-500 truncate mt-1" title={c.click_url}>
                  → {c.click_url}
                </p>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                  <span className="text-xs text-gray-600">
                    {used === 0 ? (
                      <span className="text-amber-700">Unused</span>
                    ) : (
                      <span className="text-green-700">Used in {used}</span>
                    )}
                  </span>
                  <button
                    onClick={() => handleDelete(c)}
                    disabled={busy || used > 0}
                    className="text-red-700 hover:text-red-900 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    title={used > 0 ? `Referenced by ${used} campaign(s)` : 'Delete this creative'}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
