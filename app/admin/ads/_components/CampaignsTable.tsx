// caxton-ads-v1
// Campaigns tab — sortable table with row actions.

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import type { AdCampaign } from './types';
import { PUBLICATION_LABELS, campaignStatus } from './types';

interface Props {
  campaigns: AdCampaign[];
  onChange: () => void; // parent refetches after toggle/delete
}

type SortKey = 'advertiser' | 'slot' | 'start' | 'end' | 'price' | 'status';

// Format an ISO date string (e.g. "2026-05-09T00:00:00.000Z") as "May 9, 2026".
// Returns the original string if parsing fails.
function fmtDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function CampaignsTable({ campaigns, onChange }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('start');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [busyId, setBusyId] = useState<string | null>(null);

  const sorted = [...campaigns].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    switch (sortKey) {
      case 'advertiser': return a.advertiser_name.localeCompare(b.advertiser_name) * dir;
      case 'slot': return a.ad_space.display_name.localeCompare(b.ad_space.display_name) * dir;
      case 'start': return a.start_date.localeCompare(b.start_date) * dir;
      case 'end': return a.end_date.localeCompare(b.end_date) * dir;
      case 'price': return ((Number(a.price_total) || 0) - (Number(b.price_total) || 0)) * dir;
      case 'status': return campaignStatus(a).label.localeCompare(campaignStatus(b).label) * dir;
    }
  });

  function setSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  async function handleToggle(id: string) {
    setBusyId(id);
    try {
      await adminApi.toggleAdCampaign(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string, advertiser: string) {
    if (!confirm(`Delete campaign for ${advertiser}? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await adminApi.deleteAdCampaign(id);
      onChange();
    } finally {
      setBusyId(null);
    }
  }

  if (campaigns.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-md border border-gray-200">
        <p className="text-gray-700 mb-3">No campaigns yet.</p>
        <Link
          href="/admin/ads/campaigns/new"
          className="inline-block rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700"
        >
          + Create the first campaign
        </Link>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-md border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-gray-700">
          <tr>
            <Th label="Advertiser" sortKey="advertiser" current={sortKey} dir={sortDir} onSort={setSort} />
            <Th label="Slot" sortKey="slot" current={sortKey} dir={sortDir} onSort={setSort} />
            <Th label="Pubs" />
            <Th label="Start" sortKey="start" current={sortKey} dir={sortDir} onSort={setSort} />
            <Th label="End" sortKey="end" current={sortKey} dir={sortDir} onSort={setSort} />
            <Th label="Status" sortKey="status" current={sortKey} dir={sortDir} onSort={setSort} />
            <Th label="Price" sortKey="price" current={sortKey} dir={sortDir} onSort={setSort} />
            <Th label="" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => {
            const status = campaignStatus(c);
            const busy = busyId === c.id;
            return (
              <tr key={c.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-900 font-medium">{c.advertiser_name}</td>
                <td className="px-3 py-2 text-gray-700">{c.ad_space.display_name}</td>
                <td className="px-3 py-2 text-gray-700 text-xs">{PUBLICATION_LABELS[c.publication]}</td>
                <td className="px-3 py-2 text-gray-700 text-xs whitespace-nowrap">{fmtDate(c.start_date)}</td>
                <td className="px-3 py-2 text-gray-700 text-xs whitespace-nowrap">{fmtDate(c.end_date)}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status.className}`}>
                    {status.label}
                  </span>
                </td>
                <td className="px-3 py-2 text-gray-700 text-right">
                  {c.price_total ? `$${Number(c.price_total).toLocaleString()}` : '—'}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/admin/ads/campaigns/${c.id}`}
                    className="text-blue-700 hover:text-blue-900 text-xs mr-3"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleToggle(c.id)}
                    disabled={busy}
                    className="text-gray-700 hover:text-gray-900 text-xs mr-3 disabled:opacity-50"
                  >
                    {c.active ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.advertiser_name)}
                    disabled={busy}
                    className="text-red-700 hover:text-red-900 text-xs disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  label, sortKey, current, dir, onSort,
}: {
  label: string;
  sortKey?: SortKey;
  current?: SortKey;
  dir?: 'asc' | 'desc';
  onSort?: (k: SortKey) => void;
}) {
  if (!sortKey || !onSort) {
    return <th className="px-3 py-2 text-left font-medium">{label}</th>;
  }
  const arrow = current === sortKey ? (dir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th className="px-3 py-2 text-left font-medium">
      <button onClick={() => onSort(sortKey)} className="hover:text-gray-900">
        {label}{arrow}
      </button>
    </th>
  );
}
