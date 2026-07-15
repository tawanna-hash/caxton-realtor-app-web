'use client';

// app/admin/crm/AdvertiserChannelTabs.tsx
//
// Sub-tabs inside the CRM edit drawer that group an advertiser's
// activity by channel: Print · Digital · Email · App.
//
// Data comes from GET /api/admin/advertisers/[id]/channels which
// returns per-channel buckets of campaigns / agreements / inquiries.

import { useCallback, useEffect, useState } from 'react';
import {
  IO_STATUS_LABEL,
  TEARSHEET_STATUS_LABEL,
  type InsertionOrderWithAdvertiser,
  type Tearsheet,
  type TearsheetWithAdvertiser,
} from '@/lib/insertion-orders';
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
  // IOs + tearsheets for the ACTIVE channel (fetched separately from
  // /api/admin/advertisers/[id]/channels because they live in their
  // own tables).
  const [ios, setIos] = useState<InsertionOrderWithAdvertiser[]>([]);
  const [tearsheets, setTearsheets] = useState<TearsheetWithAdvertiser[]>([]);
  const [tsBusy, setTsBusy] = useState(false);
  const [tsIssueLabel, setTsIssueLabel] = useState('');
  const [tsIssueDate, setTsIssueDate] = useState('');
  const [ioBusy, setIoBusy] = useState(false);

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

  // Side-load IOs + tearsheets whenever the active channel changes.
  useEffect(() => {
    let cancelled = false;
    const q = new URLSearchParams({
      advertiser_id: String(advertiserId),
      channel: active,
    }).toString();

    Promise.all([
      fetch(`/api/admin/insertion-orders?${q}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { rows: [] })),
      fetch(`/api/admin/tearsheets?${q}`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : { rows: [] })),
    ]).then(([ioData, tsData]) => {
      if (cancelled) return;
      setIos((ioData?.rows ?? []) as InsertionOrderWithAdvertiser[]);
      setTearsheets((tsData?.rows ?? []) as TearsheetWithAdvertiser[]);
    });

    return () => {
      cancelled = true;
    };
  }, [advertiserId, active]);

  /**
   * Upload an advertiser/agency-provided IO PDF.
   *
   * If `existingIoId` is given, attaches the file to that IO (replaces
   * the existing pdf_url). Otherwise creates a new draft IO first, then
   * uploads to that new row.
   */
  const uploadIoFile = useCallback(
    async (file: File, existingIoId?: string) => {
      setIoBusy(true);
      try {
        let targetId = existingIoId;

        // No existing IO → create an empty draft first so we can attach
        // the file to it. Ops can edit the flight dates / total later.
        if (!targetId) {
          const createRes = await fetch('/api/admin/insertion-orders', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              advertiser_id: advertiserId,
              channel: active,
              status: 'draft',
            }),
          });
          if (!createRes.ok) {
            const err = (await createRes.json().catch(() => ({}))) as { error?: string };
            throw new Error(err.error ?? `HTTP ${createRes.status}`);
          }
          const created = (await createRes.json()) as { io: InsertionOrderWithAdvertiser };
          setIos((prev) => [created.io, ...prev]);
          targetId = created.io.id;
        }

        const fd = new FormData();
        fd.append('file', file);
        const upRes = await fetch(
          `/api/admin/insertion-orders/${targetId}/upload`,
          { method: 'POST', body: fd },
        );
        if (!upRes.ok) {
          const err = (await upRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${upRes.status}`);
        }
        const upData = (await upRes.json()) as { io: InsertionOrderWithAdvertiser };
        setIos((prev) =>
          prev.map((io) => (io.id === upData.io.id ? { ...io, ...upData.io } : io)),
        );
      } catch (e) {
        alert(e instanceof Error ? e.message : 'upload failed');
      } finally {
        setIoBusy(false);
      }
    },
    [advertiserId, active],
  );

  /**
   * Clear the uploaded PDF from an IO. Falls back to the generated
   * renderer for that IO.
   */
  const clearIoPdf = useCallback(async (ioId: string) => {
    if (!window.confirm('Remove the uploaded IO PDF? The generated version will be used instead.')) {
      return;
    }
    setIoBusy(true);
    try {
      const r = await fetch(`/api/admin/insertion-orders/${ioId}/upload`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as { io: InsertionOrderWithAdvertiser };
      setIos((prev) =>
        prev.map((io) => (io.id === data.io.id ? { ...io, ...data.io } : io)),
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : 'clear failed');
    } finally {
      setIoBusy(false);
    }
  }, []);

  /** Upload a new tearsheet. Optionally linked to a specific campaign. */
  const uploadTearsheet = useCallback(
    async (file: File, campaignId?: string) => {
      setTsBusy(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('channel', active);
        fd.append('advertiser_id', String(advertiserId));
        if (campaignId) fd.append('campaign_id', campaignId);
        if (tsIssueLabel.trim()) fd.append('issue_label', tsIssueLabel.trim());
        if (tsIssueDate.trim()) fd.append('issue_date', tsIssueDate.trim());
        const r = await fetch('/api/admin/tearsheets/upload', {
          method: 'POST',
          body: fd,
        });
        if (!r.ok) {
          const err = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `HTTP ${r.status}`);
        }
        const data = (await r.json()) as { tearsheet: Tearsheet };
        const withAdv: TearsheetWithAdvertiser = {
          ...data.tearsheet,
          advertiser_name: null,
          advertiser_email: null,
          io_number: null,
        };
        setTearsheets((prev) => [withAdv, ...prev]);
        setTsIssueLabel('');
        setTsIssueDate('');
      } catch (e) {
        alert(e instanceof Error ? e.message : 'upload failed');
      } finally {
        setTsBusy(false);
      }
    },
    [advertiserId, active, tsIssueLabel, tsIssueDate],
  );

  /** Delete a tearsheet row. */
  const deleteTearsheet = useCallback(async (tsId: string) => {
    if (!window.confirm('Delete this tearsheet? This cannot be undone.')) return;
    setTsBusy(true);
    try {
      const r = await fetch(`/api/admin/tearsheets/${tsId}`, {
        method: 'DELETE',
      });
      if (!r.ok) {
        const err = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `HTTP ${r.status}`);
      }
      setTearsheets((prev) => prev.filter((t) => t.id !== tsId));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'delete failed');
    } finally {
      setTsBusy(false);
    }
  }, []);

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

          {/* Insertion orders */}
          <section>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-900">
                Insertion orders ({ios.length})
              </h4>
              <label
                className={
                  'text-xs px-2 py-1 rounded-md border border-gray-300 bg-white cursor-pointer ' +
                  (ioBusy ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-50')
                }
              >
                {ioBusy ? 'Uploading…' : '+ Upload IO'}
                <input
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadIoFile(f);
                    e.currentTarget.value = '';
                  }}
                />
              </label>
            </div>
            {ios.length === 0 ? (
              <div className="text-xs text-gray-500 py-2">
                No insertion orders yet. Upload a PDF from the advertiser or agency.
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 divide-y divide-gray-100 bg-white">
                {ios.map((io) => (
                  <div key={io.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="font-mono text-xs text-gray-700 min-w-[110px]">
                      {io.io_number}
                    </span>
                    <span className="flex-1 truncate text-gray-700">
                      {formatDateRange(io.flight_start, io.flight_end)}
                    </span>
                    <span className="tabular-nums text-gray-900">
                      {formatMoney(io.total_cents)}
                    </span>
                    <span className={
                      'text-xs px-2 py-0.5 rounded border ' +
                      statusBadgeClass(io.status)
                    }>
                      {IO_STATUS_LABEL[io.status]}
                    </span>
                    <a
                      href={`/api/admin/insertion-orders/${io.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      PDF
                    </a>
                    <label
                      className={
                        'text-xs px-2 py-0.5 rounded border cursor-pointer ' +
                        (ioBusy
                          ? 'opacity-50 pointer-events-none border-gray-300 text-gray-500'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50')
                      }
                      title={io.pdf_url ? 'Replace uploaded PDF' : 'Upload advertiser PDF'}
                    >
                      {io.pdf_url ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadIoFile(f, io.id);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {io.pdf_url ? (
                      <button
                        type="button"
                        onClick={() => void clearIoPdf(io.id)}
                        disabled={ioBusy}
                        className="text-xs px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Clear uploaded PDF (revert to generated)"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Tearsheets */}
          <section>
            <div className="mb-2 space-y-2">
              <h4 className="text-sm font-semibold text-gray-900">
                Tearsheets ({tearsheets.length})
              </h4>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={tsIssueLabel}
                  onChange={(e) => setTsIssueLabel(e.target.value)}
                  placeholder="Issue label (e.g. Aug 2026 print)"
                  className="text-xs px-2 py-1 rounded border border-gray-300 bg-white flex-1 min-w-[180px]"
                  disabled={tsBusy}
                />
                <input
                  type="date"
                  value={tsIssueDate}
                  onChange={(e) => setTsIssueDate(e.target.value)}
                  className="text-xs px-2 py-1 rounded border border-gray-300 bg-white"
                  disabled={tsBusy}
                />
                <label
                  className={
                    'text-xs px-2 py-1 rounded-md border border-gray-300 bg-white cursor-pointer ' +
                    (tsBusy ? 'opacity-50 pointer-events-none' : 'hover:bg-gray-50')
                  }
                >
                  {tsBusy ? 'Uploading…' : '+ Upload tearsheet'}
                  <input
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadTearsheet(f);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
              </div>
            </div>
            {tearsheets.length === 0 ? (
              <div className="text-xs text-gray-500 py-2">
                No tearsheets yet. Upload a proof-of-run PDF or image.
              </div>
            ) : (
              <div className="rounded-md border border-gray-200 divide-y divide-gray-100 bg-white">
                {tearsheets.map((t) => (
                  <div key={t.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="flex-1 truncate text-gray-700">
                      {t.issue_label ?? '—'}
                      {t.issue_date && (
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(t.issue_date).toLocaleDateString()}
                        </span>
                      )}
                    </span>
                    {t.io_number && (
                      <span className="font-mono text-xs text-gray-500">
                        {t.io_number}
                      </span>
                    )}
                    <span className={
                      'text-xs px-2 py-0.5 rounded border ' +
                      statusBadgeClass(t.status)
                    }>
                      {TEARSHEET_STATUS_LABEL[t.status]}
                    </span>
                    {t.file_url && (
                      <a
                        href={t.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:underline"
                      >
                        View
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void deleteTearsheet(t.id)}
                      disabled={tsBusy}
                      className="text-xs px-2 py-0.5 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      title="Delete tearsheet"
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
          </>
        )}
      </div>
    </div>
  );
}
