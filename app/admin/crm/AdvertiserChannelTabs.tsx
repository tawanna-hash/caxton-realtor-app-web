'use client';

// app/admin/crm/AdvertiserChannelTabs.tsx
//
// Sub-tabs inside the CRM edit drawer that group an advertiser's
// activity by channel: Print · Digital · Email · App.
//
// Data comes from GET /api/admin/advertisers/[id]/channels which
// returns per-channel buckets of campaigns / agreements / inquiries.

import { useEffect, useState } from 'react';
import {
  AD_CHANNELS,
  AD_CHANNEL_LABEL,
  AD_CHANNEL_DESCRIPTION,
  type AdChannel,
} from '@/lib/ad-channels';

type CampaignRow = {
  id: string;
  ad_space_slug: string;
  publication: string;
  pubs: string[] | null;
  channel: string | null;
  start_date: string;
  end_date: string;
  active: boolean;
  price_total: string | null;
};
type AgreementRow = {
  id: string;
  publication: string | null;
  type: string | null;
  status: string;
  ad_size: string | null;
  frequency: string | null;
  amount_cents: number | null;
  start_date: string | null;
  end_date: string | null;
  signed_at: string | null;
  paid_at: string | null;
};
type InquiryRow = {
  id: string;
  channel: string | null;
  slot_slug: string | null;
  slot_label: string | null;
  publication: string | null;
  status: string;
  created_at: string;
  message: string | null;
};
type Bucket = {
  campaigns: CampaignRow[];
  agreements: AgreementRow[];
  inquiries: InquiryRow[];
};

type Props = {
  advertiserId: number;
};

const CHANNEL_ACCENT: Record<AdChannel, string> = {
  print: 'text-rose-700 border-rose-500',
  digital: 'text-sky-700 border-sky-500',
  email: 'text-emerald-700 border-emerald-500',
  app: 'text-purple-700 border-purple-500',
};

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  signed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sent: 'bg-blue-50 text-blue-700 border-blue-200',
  draft: 'bg-gray-100 text-gray-700 border-gray-200',
  new: 'bg-amber-50 text-amber-700 border-amber-200',
  replied: 'bg-blue-50 text-blue-700 border-blue-200',
  quoted: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  won: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  lost: 'bg-gray-100 text-gray-600 border-gray-200',
  expired: 'bg-gray-100 text-gray-600 border-gray-200',
  cancelled: 'bg-gray-100 text-gray-600 border-gray-200',
  overdue: 'bg-red-50 text-red-700 border-red-200',
};

function formatMoney(cents: number | null | undefined) {
  if (cents == null) return '—';
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDateRange(a: string | null, b: string | null) {
  if (!a && !b) return '—';
  const fmt = (s: string | null) =>
    s
      ? new Date(s).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : '—';
  return `${fmt(a)} → ${fmt(b)}`;
}

function statusBadgeClass(status: string) {
  return STATUS_BADGE[status.toLowerCase()] ?? 'bg-gray-100 text-gray-700 border-gray-200';
}

export default function AdvertiserChannelTabs({ advertiserId }: Props) {
  const [active, setActive] = useState<AdChannel>('digital');
  const [buckets, setBuckets] = useState<Record<AdChannel, Bucket> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load defaults are already 'loading=true / error=null' via useState
    // initializers below, so no synchronous setState is needed here.
    let cancelled = false;
    fetch(`/api/admin/advertisers/${advertiserId}/channels`, {
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = (await r.json()) as { channels: Record<AdChannel, Bucket> };
        if (!cancelled) {
          setBuckets(data.channels);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'load failed');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [advertiserId]);

  const bucket = buckets?.[active] ?? { campaigns: [], agreements: [], inquiries: [] };
  const counts: Record<AdChannel, number> = {
    print: 0,
    digital: 0,
    email: 0,
    app: 0,
  };
  if (buckets) {
    for (const c of AD_CHANNELS) {
      counts[c] =
        buckets[c].campaigns.length +
        buckets[c].agreements.length +
        buckets[c].inquiries.length;
    }
  }

  return (
    <div className="rounded-md border border-gray-200 bg-white">
      <div
        className="flex border-b border-gray-200"
        role="tablist"
        aria-label="Ad channels"
      >
        {AD_CHANNELS.map((c) => {
          const isActive = active === c;
          const accent = CHANNEL_ACCENT[c];
          return (
            <button
              key={c}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(c)}
              className={
                'flex-1 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ' +
                (isActive
                  ? `${accent} bg-gray-50`
                  : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50')
              }
            >
              {AD_CHANNEL_LABEL[c]}
              <span
                className={
                  'ml-2 inline-block px-1.5 py-0.5 rounded text-[10px] tabular-nums font-semibold ' +
                  (isActive
                    ? 'bg-white text-gray-700 border border-gray-200'
                    : 'bg-gray-100 text-gray-600')
                }
              >
                {counts[c]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-gray-500">{AD_CHANNEL_DESCRIPTION[active]}</p>

        {loading && (
          <div className="text-sm text-gray-500 py-4 text-center">Loading activity…</div>
        )}
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            Failed to load: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            <section>
              <h4 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-semibold mb-2">
                Campaigns ({bucket.campaigns.length})
              </h4>
              {bucket.campaigns.length === 0 ? (
                <div className="text-sm text-gray-400 italic py-1">
                  No campaigns in this channel.
                </div>
              ) : (
                <ul className="space-y-2">
                  {bucket.campaigns.map((c) => (
                    <li
                      key={c.id}
                      className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-gray-900 font-medium truncate">
                          {c.ad_space_slug}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatDateRange(c.start_date, c.end_date)} ·{' '}
                          {(c.pubs ?? [c.publication]).join(', ')}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={
                            'inline-block px-2 py-0.5 rounded border text-xs font-medium ' +
                            (c.active
                              ? statusBadgeClass('active')
                              : statusBadgeClass('expired'))
                          }
                        >
                          {c.active ? 'Active' : 'Ended'}
                        </span>
                        {c.price_total && (
                          <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
                            ${Number(c.price_total).toLocaleString()}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-semibold mb-2">
                Agreements ({bucket.agreements.length})
              </h4>
              {bucket.agreements.length === 0 ? (
                <div className="text-sm text-gray-400 italic py-1">
                  No agreements in this channel.
                </div>
              ) : (
                <ul className="space-y-2">
                  {bucket.agreements.map((a) => (
                    <li
                      key={a.id}
                      className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="text-gray-900 font-medium">
                          {a.ad_size ?? '—'} · {a.frequency ?? '—'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {formatDateRange(a.start_date, a.end_date)} ·{' '}
                          {a.publication ?? 'no pub'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={
                            'inline-block px-2 py-0.5 rounded border text-xs font-medium ' +
                            statusBadgeClass(a.status)
                          }
                        >
                          {a.status}
                        </span>
                        <div className="text-xs text-gray-500 mt-0.5 tabular-nums">
                          {formatMoney(a.amount_cents)}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-[0.15em] text-gray-500 font-semibold mb-2">
                Inquiries ({bucket.inquiries.length})
              </h4>
              {bucket.inquiries.length === 0 ? (
                <div className="text-sm text-gray-400 italic py-1">
                  No inquiries in this channel.
                </div>
              ) : (
                <ul className="space-y-2">
                  {bucket.inquiries.map((q) => (
                    <li
                      key={q.id}
                      className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-900 font-medium truncate">
                          {q.slot_label ?? q.slot_slug ?? 'General inquiry'}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">
                          {new Date(q.created_at).toLocaleDateString(undefined, {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                          {q.publication ? ` · ${q.publication}` : ''}
                        </div>
                        {q.message && (
                          <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {q.message}
                          </div>
                        )}
                      </div>
                      <span
                        className={
                          'inline-block px-2 py-0.5 rounded border text-xs font-medium shrink-0 ' +
                          statusBadgeClass(q.status)
                        }
                      >
                        {q.status}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
