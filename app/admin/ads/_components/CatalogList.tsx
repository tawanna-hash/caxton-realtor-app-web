'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { AdCampaign, AdSpace } from './types';
import { formatSizes, isCampaignActive, ZONE_LABELS } from './types';
import {
  AD_OPS_CONTROL,
  AdOpsPagination,
} from './AdOpsUi';

const ROTATING_SLUGS = new Set([
  'feed_top_banner',
  'feed_sticky_bottom',
  'newsletter_banner',
  'article_top_leaderboard',
  'calendar_top_banner',
]);

interface Props {
  spaces: AdSpace[];
  campaigns: AdCampaign[];
}

export function CatalogList({ spaces, campaigns }: Props) {
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('all');
  const [tier, setTier] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const activeBySlug = useMemo(() => {
    const counts = new Map<string, number>();
    campaigns.forEach((campaign) => {
      if (isCampaignActive(campaign)) {
        counts.set(campaign.ad_space_slug, (counts.get(campaign.ad_space_slug) ?? 0) + 1);
      }
    });
    return counts;
  }, [campaigns]);

  const zones = useMemo(
    () => Array.from(new Set(spaces.map((space) => space.zone))).sort(),
    [spaces],
  );
  const tiers = useMemo(
    () => Array.from(new Set(spaces.map((space) => space.tier))).sort(),
    [spaces],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return spaces
      .filter((space) => zone === 'all' || space.zone === zone)
      .filter((space) => tier === 'all' || space.tier === tier)
      .filter((space) => (
        !needle
        || [space.display_name, space.slug, space.notes, formatSizes(space.sizes_json)]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle)
      ))
      .sort((a, b) => a.zone.localeCompare(b.zone) || a.display_name.localeCompare(b.display_name));
  }, [query, spaces, tier, zone]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-end gap-2 border-b border-gray-300 px-4 py-3">
        <label className="min-w-56 flex-1 space-y-1">
          <span className="block text-xs text-gray-500">Search inventory</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
            <input
              type="search"
              className={`${AD_OPS_CONTROL} w-full pl-9`}
              placeholder="Placement, slug, size, or note"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }}
            />
          </span>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Zone</span>
          <select className={`${AD_OPS_CONTROL} min-w-36`} value={zone} onChange={(event) => { setZone(event.target.value); setPage(1); }}>
            <option value="all">All zones</option>
            {zones.map((item) => <option key={item} value={item}>{ZONE_LABELS[item]}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-gray-500">Tier</span>
          <select className={`${AD_OPS_CONTROL} min-w-36`} value={tier} onChange={(event) => { setTier(event.target.value); setPage(1); }}>
            <option value="all">All tiers</option>
            {tiers.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}
          </select>
        </label>
      </div>

      {/* mobile card list */}
      <div className="divide-y divide-gray-200 md:hidden">
        {visible.map((space) => {
          const active = activeBySlug.get(space.slug) ?? 0;
          return (
            <div key={space.slug} className="p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/ads/placements?q=${encodeURIComponent(space.slug)}`}
                    className="font-medium text-gray-900 hover:text-orange-700 hover:underline truncate"
                  >
                    {space.display_name}
                  </Link>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-gray-500">{space.slug}</div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={active ? 'whitespace-nowrap font-medium text-emerald-700' : 'whitespace-nowrap text-gray-500'}>
                    {active ? `${active} live` : 'Available'}
                  </span>
                  {ROTATING_SLUGS.has(space.slug) && (
                    <div className="mt-1 inline-block rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                      Rotates
                    </div>
                  )}
                </div>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="text-gray-500">Zone</dt>
                <dd className="text-gray-700">{ZONE_LABELS[space.zone]}</dd>
                <dt className="text-gray-500">Tier</dt>
                <dd>
                  <span className={`inline-flex rounded px-2 py-0.5 font-medium capitalize ${
                    space.tier === 'premium' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700'
                  }`}>
                    {space.tier}
                  </span>
                </dd>
                <dt className="text-gray-500">Creative specs</dt>
                <dd className="col-span-2 text-gray-600">
                  <div className="line-clamp-2">{formatSizes(space.sizes_json)}</div>
                  {space.notes && <div className="mt-0.5 line-clamp-1 text-gray-500">{space.notes}</div>}
                </dd>
              </dl>
            </div>
          );
        })}
      </div>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[900px] table-fixed text-left text-xs">
          <thead className="border-b border-gray-300 bg-white text-gray-700">
            <tr>
              <th className="w-[29%] px-4 py-3 font-semibold">Placement</th>
              <th className="w-[13%] px-3 py-3 font-semibold">Zone</th>
              <th className="w-[13%] px-3 py-3 font-semibold">Tier</th>
              <th className="w-[27%] px-3 py-3 font-semibold">Creative specs</th>
              <th className="w-[18%] px-4 py-3 font-semibold">Live campaigns</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {visible.map((space) => {
              const active = activeBySlug.get(space.slug) ?? 0;
              return (
                <tr key={space.slug} className="hover:bg-orange-50/40">
                  <td className="px-4 py-2.5">
                    <Link href={`/admin/ads/placements?q=${encodeURIComponent(space.slug)}`} className="font-medium text-gray-900 hover:text-orange-700 hover:underline">
                      {space.display_name}
                    </Link>
                    <div className="mt-0.5 truncate font-mono text-[11px] text-gray-500">{space.slug}</div>
                  </td>
                  <td className="px-3 py-2.5 text-gray-700">{ZONE_LABELS[space.zone]}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex rounded px-2 py-0.5 font-medium capitalize ${
                      space.tier === 'premium' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700'
                    }`}>
                      {space.tier}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">
                    <div className="line-clamp-2">{formatSizes(space.sizes_json)}</div>
                    {space.notes && <div className="mt-0.5 line-clamp-1 text-gray-500">{space.notes}</div>}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={active ? 'font-medium text-emerald-700' : 'text-gray-500'}>
                      {active ? `${active} live` : 'Available'}
                    </span>
                    {ROTATING_SLUGS.has(space.slug) && (
                      <span className="ml-2 rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
                        Rotates
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {visible.length === 0 && (
        <div className="px-4 py-10 text-center text-sm text-gray-500">
          No inventory matches these filters.
        </div>
      )}
      <AdOpsPagination
        count={filtered.length}
        page={currentPage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
      />
    </section>
  );
}
