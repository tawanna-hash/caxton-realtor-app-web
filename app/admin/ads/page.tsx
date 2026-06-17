// /admin/ads
//
// Ad Hub — landing page for everything ads. Replaces the old tabbed
// Catalog/Creatives dashboard, which now lives at /admin/ads/inventory.
//
// Layout:
//   1. KPI tiles (live counts from adminApi + summary endpoints)
//   2. Section cards linking to each ad workflow (Inventory, Creatives,
//      Campaigns, Orders, Inquiries, Availability, Placements, Media Kit)
//   3. Quick actions footer
//
// Single source of truth for slot/package data: lib/media-kit.ts.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/admin-api';
import { APP_AD_SLOTS, PACKAGES } from '@/lib/media-kit';
import type { AdSpace, AdCreative, AdCampaign } from './_components/types';

export const dynamic = 'force-dynamic';

interface HubCounts {
  spaces: number;
  creatives: number;
  activeCampaigns: number;
  totalCampaigns: number;
  newInquiries: number;
  totalOrders: number;
}

const EMPTY: HubCounts = {
  spaces: 0,
  creatives: 0,
  activeCampaigns: 0,
  totalCampaigns: 0,
  newInquiries: 0,
  totalOrders: 0,
};

interface CampaignsResponse {
  campaigns: AdCampaign[];
}
interface SpacesResponse {
  spaces: AdSpace[];
}
interface CreativesResponse {
  creatives: AdCreative[];
}
interface InquiriesResponse {
  unread?: { all?: number };
  total?: number;
}
interface OrdersResponse {
  rows?: unknown[];
  counts?: Record<string, number>;
}

async function jsonFetch<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export default function AdsHubPage() {
  const [counts, setCounts] = useState<HubCounts>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [spacesRes, creativesRes, campaignsRes, inquiriesRes, ordersRes] =
          await Promise.all([
            adminApi.listAdSpaces() as Promise<SpacesResponse>,
            adminApi.listAdCreatives() as Promise<CreativesResponse>,
            adminApi.listAdCampaigns() as Promise<CampaignsResponse>,
            jsonFetch<InquiriesResponse>('/api/admin/ads/inquiries?limit=1'),
            jsonFetch<OrdersResponse>('/api/admin/ads/orders?limit=1'),
          ]);

        const campaigns = campaignsRes.campaigns ?? [];
        const activeCampaigns = campaigns.filter((c) => {
          const s = (c as { status?: string }).status ?? '';
          return s === 'active' || s === 'live' || s === 'running';
        }).length;

        const totalOrders = ordersRes?.counts
          ? Object.values(ordersRes.counts).reduce(
              (a, b) => a + (typeof b === 'number' ? b : 0),
              0,
            )
          : (ordersRes?.rows?.length ?? 0);

        setCounts({
          spaces: spacesRes.spaces?.length ?? 0,
          creatives: creativesRes.creatives?.length ?? 0,
          activeCampaigns,
          totalCampaigns: campaigns.length,
          newInquiries: inquiriesRes?.unread?.all ?? 0,
          totalOrders,
        });
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Load failed');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 bg-white">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Ad Hub</h1>
          <p className="text-sm uppercase tracking-[0.18em] text-gray-700 font-semibold mt-1">
            Print {'\u00b7'} Digital {'\u00b7'} Social {'\u00b7'} Mobile.{' '}
            <span className="text-gray-500 font-normal normal-case tracking-normal">
              One powerful marketing platform.
            </span>
          </p>
          <p className="text-sm text-gray-700 mt-2 max-w-2xl">
            Everything ads in one place — inventory, creatives, campaigns,
            orders, inquiries, availability, placements, and the 2026 media
            kit.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/ads/campaigns/new"
            className="rounded-md bg-[#021D40] px-4 py-2 text-white text-sm font-medium hover:bg-[#03285a]"
          >
            + New campaign
          </Link>
          <Link
            href="/admin/ads/media-kit"
            className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 text-sm font-medium hover:bg-gray-50"
          >
            Media kit
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-800 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiTile
          label="Ad slots"
          value={loading ? '\u2014' : counts.spaces.toLocaleString()}
          sub={`${APP_AD_SLOTS.length} cataloged`}
          href="/admin/ads/inventory"
        />
        <KpiTile
          label="Creatives"
          value={loading ? '\u2014' : counts.creatives.toLocaleString()}
          sub="In gallery"
          href="/admin/ads/inventory?tab=creatives"
        />
        <KpiTile
          label="Active campaigns"
          value={loading ? '\u2014' : counts.activeCampaigns.toLocaleString()}
          sub={`${counts.totalCampaigns} total`}
          href="/admin/ads/orders?channel=digital"
          accent={counts.activeCampaigns > 0 ? 'green' : 'gray'}
        />
        <KpiTile
          label="New inquiries"
          value={loading ? '\u2014' : counts.newInquiries.toLocaleString()}
          sub="Unread"
          href="/admin/ads/inquiries"
          accent={counts.newInquiries > 0 ? 'orange' : 'gray'}
        />
        <KpiTile
          label="Pipeline"
          value={loading ? '\u2014' : counts.totalOrders.toLocaleString()}
          sub="Orders + agreements"
          href="/admin/ads/orders"
        />
        <KpiTile
          label="Packages"
          value={PACKAGES.length.toLocaleString()}
          sub="Brand tiers"
          href="/admin/ads/media-kit"
        />
      </div>

      {/* Section cards */}
      <h2 className="text-base font-semibold text-gray-900 mb-3">Manage</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <SectionCard
          title="Inventory"
          desc="Browse the ad slot catalog and the uploaded creatives gallery. Default tabbed view."
          href="/admin/ads/inventory"
          cta="Open inventory"
        />
        <SectionCard
          title="Campaigns"
          desc="Create and edit individual ad campaigns: target slots, schedule flights, attach creatives."
          href="/admin/ads/orders?source=campaign"
          cta="Manage campaigns"
        />
        <SectionCard
          title="Orders"
          desc="Unified pipeline of campaigns + agreements with channel filtering and status tracking."
          href="/admin/ads/orders"
          cta="Open pipeline"
        />
        <SectionCard
          title="Inquiries"
          desc="Inbound advertiser inquiries from the public site. Triage, reply, and convert to orders."
          href="/admin/ads/inquiries"
          cta="Open inbox"
          badge={
            !loading && counts.newInquiries > 0
              ? `${counts.newInquiries} new`
              : undefined
          }
        />
        <SectionCard
          title="Availability"
          desc="Calendar view of booked vs open inventory per slot. Spot conflicts before quoting."
          href="/admin/ads/availability"
          cta="View calendar"
        />
        <SectionCard
          title="Placements"
          desc="Visual wireframes showing where each ad slot appears in the app. Use during sales walk-throughs."
          href="/admin/ads/placements"
          cta="View placements"
        />
        <SectionCard
          title="Media Kit"
          desc="Live 2026 rate card — print matrix, brand packages, digital slots, e-blasts, deadlines, policy."
          href="/admin/ads/media-kit"
          cta="Open media kit"
          accent="navy"
        />
        <SectionCard
          title="Media Kit PDF"
          desc="Download the printable 2026 media kit. Same numbers as the live page and quote engine."
          href="/admin/ads/media-kit/pdf"
          cta="Download PDF"
          newTab
        />
        <SectionCard
          title="Public advertise page"
          desc="What advertisers see at realtynewsnow.app/advertise. Useful sanity check before launching changes."
          href="/advertise"
          cta="View public page"
          newTab
        />
      </div>
    </div>
  );
}

// ─── Components ───────────────────────────────────────────────────────────

interface KpiProps {
  label: string;
  value: string;
  sub?: string;
  href: string;
  accent?: 'gray' | 'green' | 'orange';
}

function KpiTile({ label, value, sub, href, accent = 'gray' }: KpiProps) {
  const accentRing =
    accent === 'green'
      ? 'ring-green-200'
      : accent === 'orange'
        ? 'ring-orange-200'
        : 'ring-gray-200';
  const accentValueColor =
    accent === 'green'
      ? 'text-green-700'
      : accent === 'orange'
        ? 'text-orange-700'
        : 'text-gray-900';
  return (
    <Link
      href={href}
      className={`block rounded-xl bg-white ring-1 ${accentRing} px-4 py-3 hover:ring-gray-300 hover:shadow-sm transition`}
    >
      <div className="text-xs uppercase tracking-wide text-gray-700">
        {label}
      </div>
      <div className={`text-2xl font-semibold tabular-nums mt-1 ${accentValueColor}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-700 mt-0.5">{sub}</div>}
    </Link>
  );
}

interface SectionCardProps {
  title: string;
  desc: string;
  href: string;
  cta: string;
  badge?: string;
  accent?: 'navy';
  newTab?: boolean;
}

function SectionCard({
  title,
  desc,
  href,
  cta,
  badge,
  accent,
  newTab,
}: SectionCardProps) {
  const isNavy = accent === 'navy';
  const content = (
    <div
      className={
        'h-full rounded-xl ring-1 p-5 transition hover:shadow-sm flex flex-col ' +
        (isNavy
          ? 'bg-[#021D40] text-white ring-[#021D40] hover:bg-[#03285a]'
          : 'bg-white ring-gray-200 hover:ring-gray-300')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <h3
          className={
            'text-base font-semibold ' + (isNavy ? 'text-white' : 'text-gray-900')
          }
        >
          {title}
        </h3>
        {badge && (
          <span className="inline-flex rounded-full bg-orange-100 text-orange-800 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 ring-1 ring-orange-200">
            {badge}
          </span>
        )}
      </div>
      <p
        className={
          'text-sm mt-2 flex-1 ' + (isNavy ? 'text-white/85' : 'text-gray-700')
        }
      >
        {desc}
      </p>
      <div
        className={
          'text-sm font-medium mt-3 ' +
          (isNavy ? 'text-white' : 'text-blue-700')
        }
      >
        {cta} {'\u2192'}
      </div>
    </div>
  );
  if (newTab) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="block">
        {content}
      </a>
    );
  }
  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}
