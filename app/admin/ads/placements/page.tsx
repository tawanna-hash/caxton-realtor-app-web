'use client';

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ExternalLink, Plus, Search } from 'lucide-react';
import { APP_AD_SLOTS, type AppAdSlot } from '@/lib/media-kit';
import { PlacementWireframe, hasWireframe } from '@/components/ads/PlacementWireframe';
import PageTitle from '@/components/ui/PageTitle';
import {
  AD_OPS_CONTROL,
  AD_OPS_PRIMARY,
  AD_OPS_SECONDARY,
  AdOpsMetrics,
  AdOpsPagination,
} from '../_components/AdOpsUi';

export const dynamic = 'force-dynamic';

const ZONE_LABEL: Record<AppAdSlot['zone'], string> = {
  feed: 'Feed',
  article: 'Article',
  calendar: 'Calendar',
  account: 'Account',
  newsletter: 'Newsletter',
  app: 'App-wide',
};

const HOST_PAGE_BY_SLUG: Record<string, string> = {
  feed_top_banner: '/feed',
  feed_inline_card: '/feed',
  feed_sticky_bottom: 'Every public page (sticky)',
  featured_builder_strip: '/builders + /inventory',
  giveaway_prize_sponsor: '/giveaways',
  article_top_leaderboard: '/feed → any article',
  article_mid_inline: '/feed → any article',
  article_bottom: '/feed → any article',
  article_sidebar_desktop: '/feed → any article (desktop only)',
  article_interstitial: '/feed → every 4th article tap',
  calendar_top_banner: '/calendar',
  calendar_event_sponsor: '/calendar (sponsored event card)',
  account_splash: '/account + /profile',
  splash_welcome: 'First-launch app welcome',
  newsletter_banner: 'Friday email',
  push_sponsorship: 'iOS / Android push notification',
};

const TIER_ORDER: Record<AppAdSlot['tier'], number> = { premium: 0, standard: 1 };

function PlacementRow({ slot }: { slot: AppAdSlot }) {
  const hostPage = HOST_PAGE_BY_SLUG[slot.slug] ?? ZONE_LABEL[slot.zone];
  const unitLabel = slot.pricingUnit === 'per send'
    ? '/send'
    : slot.pricingUnit === 'per push'
      ? '/push'
      : '/wk';

  return (
    <article className="grid min-w-[980px] grid-cols-[210px_minmax(220px,1fr)_150px_190px_170px] border-b border-gray-200 last:border-b-0 hover:bg-orange-50/30">
      <div className="h-36 border-r border-gray-200 bg-gray-50 p-2.5">
        {hasWireframe(slot.slug) ? (
          <PlacementWireframe slug={slot.slug} />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-gray-500">Preview coming soon</div>
        )}
      </div>
      <div className="min-w-0 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <h2 className="text-sm font-semibold text-gray-900">{slot.name}</h2>
          {slot.rotates && (
            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Rotates
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] text-gray-500">{slot.slug}</div>
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-gray-600">{slot.notes}</p>
      </div>
      <div className="px-3 py-3 text-xs">
        <div className="font-medium text-gray-800">{ZONE_LABEL[slot.zone]}</div>
        <span className={`mt-1.5 inline-flex rounded px-1.5 py-0.5 font-medium capitalize ${
          slot.tier === 'premium' ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-700'
        }`}>
          {slot.tier}
        </span>
      </div>
      <div className="px-3 py-3 text-xs text-gray-600">
        <div className="font-medium text-gray-800">{hostPage}</div>
        <div className="mt-1.5 line-clamp-2">{slot.sizes}</div>
      </div>
      <div className="flex flex-col items-start px-4 py-3 text-xs">
        <div className="font-semibold tabular-nums text-gray-900">${slot.weeklySingle}{unitLabel}</div>
        {slot.monthlySingle && <div className="mt-0.5 tabular-nums text-gray-500">${slot.monthlySingle}/mo</div>}
        <div className="mt-auto flex flex-col items-start gap-1 pt-2">
          <Link
            href={`/advertise/checkout/${slot.slug}?pub=realtyline`}
            target="_blank"
            className="inline-flex items-center gap-1 font-medium text-orange-700 hover:underline"
          >
            Open checkout <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
          <Link href={`/admin/ads/inventory?tab=catalog&slug=${slot.slug}`} className="text-gray-600 hover:text-gray-900 hover:underline">
            View in catalog
          </Link>
        </div>
      </div>
    </article>
  );
}

function PlacementsPageInner() {
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get('q') ?? '');
  const [zone, setZone] = useState('all');
  const [tier, setTier] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const sorted = useMemo(() => [...APP_AD_SLOTS].sort((a, b) => (
    (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9)
    || a.zone.localeCompare(b.zone)
    || a.name.localeCompare(b.name)
  )), []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sorted
      .filter((slot) => zone === 'all' || slot.zone === zone)
      .filter((slot) => tier === 'all' || slot.tier === tier)
      .filter((slot) => (
        !needle
        || [
          slot.name,
          slot.slug,
          slot.notes,
          slot.sizes,
          HOST_PAGE_BY_SLUG[slot.slug],
        ].filter(Boolean).join(' ').toLowerCase().includes(needle)
      ));
  }, [query, sorted, tier, zone]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const zones = Object.entries(ZONE_LABEL) as Array<[AppAdSlot['zone'], string]>;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 px-5 py-7 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Admin · Ad Ops</div>
          <PageTitle size="md">Placements</PageTitle>
          <p className="mt-1 max-w-2xl text-sm text-gray-600">
            Visual slot guide with host-page context, specs, pricing, and direct checkout access.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/admin/ads/inventory" className={AD_OPS_SECONDARY}>Inventory</Link>
          <Link href="/admin/ads/campaigns/new" className={AD_OPS_PRIMARY}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New campaign
          </Link>
        </div>
      </header>

      <AdOpsMetrics
        label="Placement summary"
        items={[
          { label: 'Total placements', value: sorted.length },
          { label: 'Premium', value: sorted.filter((slot) => slot.tier === 'premium').length },
          { label: 'Rotating', value: sorted.filter((slot) => slot.rotates).length },
          { label: 'Zones', value: new Set(sorted.map((slot) => slot.zone)).size },
        ]}
      />

      <section className="overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-end gap-2 border-b border-gray-300 px-4 py-3">
          <label className="min-w-56 flex-1 space-y-1">
            <span className="block text-xs text-gray-500">Search placements</span>
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" aria-hidden="true" />
              <input
                type="search"
                className={`${AD_OPS_CONTROL} w-full pl-9`}
                placeholder="Name, slug, host page, or size"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setPage(1); }}
              />
            </span>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-gray-500">Zone</span>
            <select className={`${AD_OPS_CONTROL} min-w-36`} value={zone} onChange={(event) => { setZone(event.target.value); setPage(1); }}>
              <option value="all">All zones</option>
              {zones.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs text-gray-500">Tier</span>
            <select className={`${AD_OPS_CONTROL} min-w-36`} value={tier} onChange={(event) => { setTier(event.target.value); setPage(1); }}>
              <option value="all">All tiers</option>
              <option value="premium">Premium</option>
              <option value="standard">Standard</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <div className="grid min-w-[980px] grid-cols-[210px_minmax(220px,1fr)_150px_190px_170px] border-b border-gray-300 bg-white text-xs font-semibold text-gray-700">
            <div className="px-4 py-3">Wireframe</div>
            <div className="px-4 py-3">Placement</div>
            <div className="px-3 py-3">Zone / tier</div>
            <div className="px-3 py-3">Surface / specs</div>
            <div className="px-4 py-3">Rate / actions</div>
          </div>
          {visible.map((slot) => <PlacementRow key={slot.slug} slot={slot} />)}
        </div>
        {visible.length === 0 && (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            No placements match these filters.
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
    </div>
  );
}

export default function AdminAdsPlacementsPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-[1500px] px-5 py-7 text-sm text-gray-600 lg:px-8">Loading placements…</div>}>
      <PlacementsPageInner />
    </Suspense>
  );
}
