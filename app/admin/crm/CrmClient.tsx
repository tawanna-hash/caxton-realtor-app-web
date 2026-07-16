'use client';

// app/admin/crm/CrmClient.tsx
//
// CRM workspace: searchable + filterable list of advertisers (which
// double as CRM contacts) with a side drawer for editing PressBook
// fields (phone, address, status, notes, tags, additional contacts).
//
// Design language matches Caxton admin:
//   • serif Georgia titles, eyebrow text-sm uppercase tracking-[0.2em]
//   • rounded-md cards, gray-200 borders, blue-600 primary buttons
//
// Existing transactional `/admin/advertisers` page is unchanged; this
// page reads + writes the same row.

import { useCallback, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type {
  AdvertiserCrmRow,
  AdvertiserStaff,
  AdvertiserStatus,
  AdvertiserType,
} from '@/lib/advertisers';
import type { Publication, PublicationKey } from '@/lib/publication-theme';
import CrmComposer from './_components/CrmComposer';
import {
  PUBLICATION_OPTIONS,
  PUBLICATION_KEYS,
  getPublicationTheme,
  parsePublications,
  serializePublications,
} from '@/lib/publication-theme';
import { formatPhone, formatPhoneInput } from '@/lib/format-phone';
import LocationsStaffEditor from './LocationsStaffEditor';
import AdvertiserChannelTabs from './AdvertiserChannelTabs';
import AdvertiserImageUploader from '@/components/AdvertiserImageUploader';
import { MARKETS, MARKET_META, isMarketLive, type Market } from '@/lib/types/markets';
import PageTitle from '@/components/ui/PageTitle';
import {
  ADVERTISER_HEADER_STYLES,
  HEADER_STYLE_META,
  coerceHeaderStyle,
} from '@/lib/advertiser-header-styles';

type Props = { initialRows: AdvertiserCrmRow[] };

const STATUS_OPTIONS: { value: AdvertiserStatus; label: string; tone: string }[] = [
  { value: 'prospect',   label: 'Prospect',   tone: 'bg-sky-50 text-sky-700 border-sky-200' },
  { value: 'advertiser', label: 'Advertiser', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'archived',   label: 'Archived',   tone: 'bg-gray-100 text-gray-600 border-gray-200' },
];

const TYPE_OPTIONS: { value: AdvertiserType; label: string }[] = [
  { value: 'advertiser', label: 'Advertiser' },
  { value: 'client',     label: 'Client' },
  { value: 'prospect',   label: 'Prospect' },
  { value: 'mailing',    label: 'Mailing only' },
];

export default function CrmClient({ initialRows }: Props) {
  const [rows, setRows] = useState(initialRows);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdvertiserStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<AdvertiserType | 'all'>('all');
  const [pubFilter, setPubFilter] = useState<PublicationKey | 'all'>('all');
  const [editing, setEditing] = useState<AdvertiserCrmRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── Market tabs <-> ?market= URL param <-> pubFilter ─────────────
  // Dashboard cards deep-link here with ?market=austin etc.; the tab
  // reflects the current publication filter and pushes the URL when
  // the user clicks a different tab. We keep pubFilter as the source
  // of truth for filtering (chips already read from it).
  //
  // Rather than mirroring URL -> state with an effect (which triggers a
  // cascading render and lints against react-hooks/set-state-in-effect),
  // we derive activeMarket directly from either the URL or pubFilter
  // per render and let handleMarketTab keep them in sync when the user
  // clicks a tab.
  const marketFromUrl: Market | null = (() => {
    const raw = searchParams?.get('market');
    if (!raw) return null;
    return (MARKETS as readonly string[]).includes(raw) ? (raw as Market) : null;
  })();

  const activeMarket: Market | 'all' = (() => {
    if (marketFromUrl) return marketFromUrl;
    if (pubFilter === 'all') return 'all';
    for (const m of MARKETS) {
      if ((MARKET_META[m].publication as string) === (pubFilter as string)) return m;
    }
    return 'all';
  })();

  const handleMarketTab = useCallback(
    (market: Market | 'all') => {
      if (market === 'all') {
        setPubFilter('all');
        router.replace('/admin/crm');
        return;
      }
      const pub = MARKET_META[market].publication;
      // Cast is safe: MARKET_META publication brand slugs are a subset of
      // PublicationKey; the type refinement isn't tracked through the
      // record lookup so we assert it here.
      setPubFilter(pub as unknown as PublicationKey);
      router.replace(`/admin/crm?market=${market}`);
    },
    [router],
  );

  const marketCounts = useMemo(() => {
    const counts: Record<Market | 'all', number> = {
      all: rows.length,
      austin: 0,
      san_antonio: 0,
      houston: 0,
      dallas: 0,
    };
    for (const r of rows) {
      const advPubs = parsePublications(r.publication);
      for (const m of MARKETS) {
        // Market ids and PublicationKey values share the same strings
        // ('austin', 'san_antonio', 'houston', 'dallas'). Compare directly.
        if (advPubs.includes(m as unknown as PublicationKey)) {
          counts[m] += 1;
        }
      }
    }
    return counts;
  }, [rows]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 1800);
  }, []);

  // ── filtering ───────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (typeFilter !== 'all' && r.type !== typeFilter) return false;
      if (pubFilter !== 'all') {
        const advPubs = parsePublications(r.publication);
        if (!advPubs.includes(pubFilter)) return false;
      }
      if (!q) return true;
      const hay = [
        r.name, r.company, r.first_name, r.last_name,
        r.contact_email, r.portal_email, r.phone, r.office_phone,
        r.city, r.state, r.notes,
        ...(r.tags ?? []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [rows, query, statusFilter, typeFilter, pubFilter]);

  // ── counts for filter chips ─────────────────────────────────────
  // Recent bounces — any advertiser with a bounce flag set. We keep this
  // pure (no Date.now) so React can dedupe renders; the webhook sets the
  // flag and it stays visible until the user resolves the row.
  const recentBounces = useMemo(
    () => rows.filter((r) => !!r.last_bounced_at),
    [rows],
  );

  const statusCounts = useMemo(() => {
    const c: Record<AdvertiserStatus, number> = { prospect: 0, advertiser: 0, archived: 0 };
    for (const r of rows) c[r.status ?? 'prospect'] = (c[r.status ?? 'prospect'] ?? 0) + 1;
    return c;
  }, [rows]);

  const reload = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/advertisers', { cache: 'no-store' });
      if (res.status === 401) { router.push('/admin/login'); return; }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // The list endpoint already returns advertisers; we re-derive
      // last_click_at from rows[*].last_click_at if present, otherwise
      // null. Detailed reload is fine; full-page refresh path:
      if (Array.isArray(data.advertisers)) {
        setRows((prev) => {
          // Merge: keep prior last_click_at since list endpoint may
          // not include it yet.
          const byId = new Map(prev.map((p) => [p.id, p.last_click_at]));
          return data.advertisers.map((a: AdvertiserCrmRow) => ({
            ...a,
            last_click_at: byId.get(a.id) ?? a.last_click_at ?? null,
          }));
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'reload failed');
    }
  }, [router]);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-5">
      {/* Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Admin · Advertisers
          </div>
          <PageTitle size="md">
            Advertisers
          </PageTitle>
          <p className="text-sm text-gray-600 mt-1">
            Unified workspace for advertiser relationships. Search, filter,
            copy share links, view analytics, and edit contact details, status,
            notes, and tags.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700"
          >
            New advertiser
          </button>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-md bg-gray-900 text-white text-sm px-4 py-2 shadow-lg">
          {toast}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Market tabs ──────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Markets">
        <button
          type="button"
          role="tab"
          aria-selected={activeMarket === 'all'}
          onClick={() => handleMarketTab('all')}
          className={
            'px-4 py-2 rounded-md text-sm font-medium border transition-colors ' +
            (activeMarket === 'all'
              ? 'bg-gray-900 text-white border-gray-900'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
          }
        >
          All markets
          <span className={
            'ml-2 tabular-nums text-xs ' +
            (activeMarket === 'all' ? 'text-gray-300' : 'text-gray-500')
          }>
            {marketCounts.all}
          </span>
        </button>
        {MARKETS.map((market) => {
          const meta = MARKET_META[market];
          const live = isMarketLive(market);
          const isActive = activeMarket === market;
          return (
            <button
              key={market}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => handleMarketTab(market)}
              className={
                'px-4 py-2 rounded-md text-sm font-medium border transition-colors ' +
                (isActive
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50') +
                (live ? '' : ' opacity-60')
              }
              title={live ? undefined : `${meta.label} — coming soon`}
            >
              {meta.label}
              {!live && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-600 font-semibold">
                  Soon
                </span>
              )}
              <span className={
                'ml-2 tabular-nums text-xs ' +
                (isActive ? 'text-gray-300' : 'text-gray-500')
              }>
                {marketCounts[market]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filters ────────────────────────────────────────────────── */}
      <div className="rounded-md border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone, city, tags…"
            className="flex-1 min-w-[240px] px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as AdvertiserType | 'all')}
            className="px-3 py-2 rounded-md border border-gray-300 text-sm"
          >
            <option value="all">All types</option>
            {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select
            value={pubFilter}
            onChange={(e) => setPubFilter(e.target.value as PublicationKey | 'all')}
            className="px-3 py-2 rounded-md border border-gray-300 text-sm"
          >
            <option value="all">All publications</option>
            {PUBLICATION_OPTIONS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </div>

        {recentBounces.length > 0 && (
            <div className="rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 flex items-start gap-3">
            <span className="text-lg leading-none">⚠</span>
            <div className="flex-1 min-w-0">
              <div className="font-semibold">
                {recentBounces.length} advertiser{recentBounces.length === 1 ? '' : 's'} with recent bounce{recentBounces.length === 1 ? '' : 's'}
              </div>
              <div className="mt-1 text-xs text-red-800 truncate">
                {recentBounces.slice(0, 5).map((r) => r.contact_email ?? r.name).filter(Boolean).join(', ')}
                {recentBounces.length > 5 ? ` … (+${recentBounces.length - 5} more)` : ''}
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <StatusChip label="All" active={statusFilter === 'all'} count={rows.length} onClick={() => setStatusFilter('all')} />
          {STATUS_OPTIONS.map((s) => (
            <StatusChip
              key={s.value}
              label={s.label}
              tone={s.tone}
              active={statusFilter === s.value}
              count={statusCounts[s.value] ?? 0}
              onClick={() => setStatusFilter(s.value)}
            />
          ))}
        </div>

      </div>

      {/* List */}
      <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
          <div className="col-span-3">Contact</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-2">Publication</div>
          <div className="col-span-2">Hotspots / 30d</div>
          <div className="col-span-1">Gate</div>
          <div className="col-span-1">Opens</div>
          <div className="col-span-2 text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-500">
            No contacts match your filters.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filtered.map((r) => (
              <CrmRow
                key={r.id}
                row={r}
                onOpen={() => setEditing(r)}
                onCopyLink={async () => {
                  const origin = typeof window !== 'undefined' ? window.location.origin : '';
                  const url = `${origin}/r/advertiser/${r.slug}?t=${r.share_token}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    flash('Share link copied');
                  } catch {
                    window.prompt('Copy this URL:', url);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Edit drawer */}
      {editing && (
        <EditDrawer
          row={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
          onDeleted={async () => {
            setEditing(null);
            await reload();
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {creating && (
        <CreateAdvertiserModal
          onClose={() => setCreating(false)}
          onCreated={async () => {
            setCreating(false);
            await reload();
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="fixed bottom-6 right-6 z-40 rounded-md bg-purple-700 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-purple-800"
      >
        Compose email
      </button>
      <CrmComposer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        rows={rows}
        adminEmail={null}
        initialFilter={{
          statuses: statusFilter === 'all' ? [] : [statusFilter],
          publications: pubFilter === 'all' ? [] : [pubFilter],
          query,
        }}
      />
    </div>
  );
}

// CrmRow: list-row UI with quick actions (copy share link, analytics, edit).
function CrmRow({
  row,
  onOpen,
  onCopyLink,
}: {
  row: AdvertiserCrmRow;
  onOpen: () => void;
  onCopyLink: () => void | Promise<void>;
}) {
  return (
    <div className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-blue-50/40 transition">
      <button
        type="button"
        onClick={onOpen}
        className="col-span-3 min-w-0 text-left"
      >
        <div className="font-medium text-gray-900 truncate hover:underline">{row.name}</div>
        <div className="text-xs text-gray-500 truncate">
          {[row.contact_email, formatPhone(row.phone)].filter(Boolean).join(' - ') || row.slug}
        </div>
      </button>
      <div className="col-span-1">
        <StatusBadge status={row.status ?? 'prospect'} />
      </div>
      <div className="col-span-2">
        <PublicationBadge publication={row.publication ?? 'austin'} />
      </div>
      <div className="col-span-2 text-sm text-gray-700">
        {row.hotspot_count} <span className="text-gray-400">/</span>{' '}
        <span className="text-gray-500">{row.clicks_30d} clicks</span>
        {row.last_click_at && (
          <div className="text-xs text-gray-400">
            last touch {relativeTime(row.last_click_at)}
          </div>
        )}
      </div>
      <div className="col-span-1 text-xs">
        {row.requires_email_gate ? (
          <span className="inline-block px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700">
            email
          </span>
        ) : (
          <span className="inline-block px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500">
            open
          </span>
        )}
      </div>
      <div className="col-span-1 text-xs">
        {row.last_bounced_at ? (
          <div className="flex flex-col leading-tight gap-0.5">
            <span
              className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 border border-red-300 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider w-fit"
              title={`Last bounce: ${row.last_bounce_type ?? 'unknown'} on ${formatShortDate(row.last_bounced_at)}`}
            >
              Bounced
            </span>
            <span className="text-gray-500">{formatShortDate(row.last_bounced_at)}</span>
          </div>
        ) : row.open_count && row.open_count > 0 ? (
          <div className="flex flex-col leading-tight">
            <span className="font-medium text-emerald-700">{row.open_count}</span>
            <span className="text-gray-500">{formatShortDate(row.last_opened_at)}</span>
          </div>
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </div>
      <div className="col-span-2 flex items-center justify-end gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={onCopyLink}
          className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          title="Copy public share link"
        >
          Copy link
        </button>
        <Link
          href={`/admin/reports?tab=advertisers&advertiserId=${row.id}`}
          className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700"
          title="Open advertiser analytics dashboard"
        >
          Open
        </Link>
        <button
          type="button"
          onClick={onOpen}
          className="px-2 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          Edit
        </button>
      </div>
    </div>
  );
}


function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function publicationTone(key: PublicationKey): string {
  switch (key) {
    case 'san_antonio': return 'bg-purple-50 text-purple-800 border-purple-200';
    case 'houston':     return 'bg-teal-50 text-teal-800 border-teal-200';
    case 'dallas':      return 'bg-amber-50 text-amber-800 border-amber-200';
    case 'austin':
    default:            return 'bg-blue-50 text-blue-800 border-blue-200';
  }
}

function PublicationBadge({ publication }: { publication?: Publication | string | null }) {
  const pubs = parsePublications(publication);
  return (
    <div className="flex flex-wrap gap-1">
      {pubs.map((p) => {
        const theme = getPublicationTheme(p);
        return (
          <span
            key={p}
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${publicationTone(p)}`}
          >
            {theme.shortName}
          </span>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Filter chip
// ─────────────────────────────────────────────────────────────────
function StatusChip({
  label, active, count, tone, onClick,
}: {
  label: string; active: boolean; count: number; tone?: string; onClick: () => void;
}) {
  const base = active
    ? 'bg-blue-600 text-white border-blue-600'
    : tone || 'bg-white text-gray-700 border-gray-300';
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full border text-xs font-medium ${base}`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
}

function StatusBadge({ status }: { status: AdvertiserStatus }) {
  const opt = STATUS_OPTIONS.find((s) => s.value === status) ?? STATUS_OPTIONS[0];
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${opt.tone}`}>
      {opt.label}
    </span>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const day = 1000 * 60 * 60 * 24;
  if (diff < day) return 'today';
  if (diff < 2 * day) return 'yesterday';
  if (diff < 30 * day) return `${Math.floor(diff / day)}d ago`;
  if (diff < 365 * day) return `${Math.floor(diff / (30 * day))}mo ago`;
  return `${Math.floor(diff / (365 * day))}y ago`;
}

// ─────────────────────────────────────────────────────────────────
// Edit drawer
// ─────────────────────────────────────────────────────────────────
function EditDrawer({
  row, onClose, onSaved, onDeleted, onError,
}: {
  row: AdvertiserCrmRow;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  // Ad-management state (publication, contact email, email gate) and
  // destructive actions (rotate share token, delete). These previously
  // lived on the standalone /admin/advertisers page; surfacing them here
  // lets the CRM be the single place for everything about an advertiser.
  // Multi-pub: stored as a sorted PublicationKey[]. Serialized to CSV on save.
  const [publications, setPublications] = useState<PublicationKey[]>(
    () => parsePublications(row.publication),
  );
  const togglePublication = (key: PublicationKey) => {
    setPublications((prev) => {
      const has = prev.includes(key);
      const next = has ? prev.filter((k) => k !== key) : [...prev, key];
      // Never allow zero — default back to Austin if the user uncheck-all.
      if (next.length === 0) return ['austin'];
      // Canonical order.
      return PUBLICATION_KEYS.filter((k) => next.includes(k));
    });
  };
  const [contactEmail, setContactEmail] = useState(row.contact_email ?? '');
  const [requiresGate, setRequiresGate] = useState<boolean>(row.requires_email_gate ?? false);
  const [shareToken, setShareToken] = useState<string>(row.share_token);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Staff lifted from <LocationsStaffEditor> so we can hide company-level
  // Person/Contact fields when they would duplicate an existing staff row.
  const [editorStaff, setEditorStaff] = useState<AdvertiserStaff[]>([]);

  const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/r/advertiser/${row.slug}?t=${shareToken}`;

  const copyShareUrl = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1600);
    } catch {
      window.prompt('Copy this URL:', shareUrl);
    }
  };

  const rotateShareToken = async () => {
    if (!window.confirm(`Rotate the share token for "${row.name}"? Old share URLs will stop working.`)) {
      return;
    }
    setShareBusy(true);
    try {
      const res = await fetch(`/api/admin/advertisers/${row.id}/regenerate-token`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.advertiser?.share_token) {
        setShareToken(data.advertiser.share_token);
      } else if (data?.share_token) {
        setShareToken(data.share_token);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : 'rotate failed');
    } finally {
      setShareBusy(false);
    }
  };

  const deleteAdvertiser = async () => {
    if (!window.confirm(`Delete "${row.name}"? Their hotspot links will be unlinked (hotspots remain).`)) {
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/advertisers/${row.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onDeleted();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'delete failed');
    } finally {
      setDeleting(false);
    }
  };
  // Portal magic-link state — separate from the form so it doesn't bleed
  // into the PATCH payload. Result holds the consume URL + email status
  // returned by /api/admin/portal-links.
  const [sendingLink, setSendingLink] = useState(false);
  const [linkResult, setLinkResult] = useState<{ url?: string; status?: string; error?: string } | null>(null);

  // Submission-token state. We mirror row.submission_token in local state
  // so the drawer reflects the new token immediately after Generate without
  // a full page reload.
  const [submissionToken, setSubmissionToken] = useState<string | null>(
    row.submission_token ?? null,
  );
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const regenerateSubmissionToken = async () => {
    if (
      submissionToken &&
      !window.confirm(
        'A submission link already exists. Generating a new one will invalidate the old link. Continue?',
      )
    ) {
      return;
    }
    setTokenBusy(true);
    setTokenError(null);
    try {
      const res = await fetch(
        `/api/admin/advertisers/${row.id}/regenerate-submission-token`,
        { method: 'POST' },
      );
      const data = await res.json();
      if (!res.ok) {
        setTokenError(data?.error ?? `HTTP ${res.status}`);
        return;
      }
      setSubmissionToken(data.submission_token);
    } catch (err) {
      setTokenError(err instanceof Error ? err.message : 'failed');
    } finally {
      setTokenBusy(false);
    }
  };

  const submissionUrl = submissionToken
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/submit-event/${submissionToken}`
    : null;

  const copySubmissionUrl = async () => {
    if (!submissionUrl) return;
    try {
      await navigator.clipboard.writeText(submissionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Fall back to a manual select if clipboard API is blocked.
    }
  };

  const sendPortalLink = async (
    purpose: 'login' | 'sign_agreement' | 'pay_invoice' | 'form' = 'login',
  ) => {
    setSendingLink(true);
    setLinkResult(null);
    try {
      const res = await fetch('/api/admin/portal-links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ advertiser_id: row.id, purpose }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLinkResult({ error: data?.error ?? `HTTP ${res.status}` });
        return;
      }
      setLinkResult({ url: data.consume_url, status: data.email_status });
    } catch (err) {
      setLinkResult({ error: err instanceof Error ? err.message : 'send failed' });
    } finally {
      setSendingLink(false);
    }
  };

  const [form, setForm] = useState({
    type:           row.type           ?? 'advertiser',
    status:         row.status         ?? 'prospect',
    first_name:     row.first_name     ?? '',
    last_name:      row.last_name      ?? '',
    company:        row.company        ?? '',
    title:          row.title          ?? '',
    industry:       row.industry       ?? '',
    license_number: row.license_number ?? '',
    phone:          formatPhone(row.phone),
    office_phone:   formatPhone(row.office_phone),
    website:        row.website        ?? '',
    // Public profile (Session 18)
    avatar_url:     row.avatar_url     ?? '',
    tagline:        row.tagline        ?? '',
    bio:            row.bio            ?? '',
    header_style:   coerceHeaderStyle(row.header_style),
    facebook_url:   row.facebook_url   ?? '',
    instagram_url:  row.instagram_url  ?? '',
    linkedin_url:   row.linkedin_url   ?? '',
    twitter_url:    row.twitter_url    ?? '',
    youtube_url:    row.youtube_url    ?? '',
    address:        row.address        ?? '',
    address_2:      row.address_2      ?? '',
    city:           row.city           ?? '',
    state:          row.state          ?? '',
    zip:            row.zip            ?? '',
    // Representative mailing address (separate from company address above).
    rep_address:    row.rep_address    ?? '',
    rep_city:       row.rep_city       ?? '',
    rep_state:      row.rep_state      ?? '',
    rep_zip:        row.rep_zip        ?? '',
    notes:          row.notes          ?? '',
    tags:           (row.tags ?? []).join(', '),
  });
  const [saving, setSaving] = useState(false);

  const update = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // ---- Duplicate-of-staff detection ------------------------------------
  //
  // Tawanna's rule (June 2026): if the company-level Person fields (name,
  // email) or Contact phones already appear on a staff row in the "Locations
  // & staff" section below, don't show those fields again as separate inputs
  // -- it confuses operators and risks the public page double-listing the
  // same person. We collapse the duplicates into a small "Same as Laura
  // Schlameus in staff" note and skip the input.
  //
  // Comparison is case-insensitive and ignores whitespace; phone matching
  // strips non-digits so "(512) 960-5172" matches "5129605172".
  const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();
  const normPhone = (s: string | null | undefined) =>
    (s ?? '').replace(/\D+/g, '');
  const fullName = `${form.first_name} ${form.last_name}`.trim();

  const matchStaffByName = (name: string): AdvertiserStaff | undefined => {
    const n = norm(name);
    if (!n) return undefined;
    return editorStaff.find((s) => norm(s.name) === n);
  };
  const matchStaffByEmail = (email: string): AdvertiserStaff | undefined => {
    const e = norm(email);
    if (!e) return undefined;
    return editorStaff.find((s) => norm(s.email) === e);
  };
  const matchStaffByPhone = (phone: string): AdvertiserStaff | undefined => {
    const p = normPhone(phone);
    if (!p) return undefined;
    return editorStaff.find((s) => normPhone(s.phone) === p);
  };

  const nameMatch = matchStaffByName(fullName);
  const emailMatch = matchStaffByEmail(contactEmail);
  const mobileMatch = matchStaffByPhone(form.phone);
  const officeMatch = matchStaffByPhone(form.office_phone);

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        // Ad-management fields merged from the legacy /admin/advertisers page.
        // Multi-pub: send as canonical CSV. API accepts either array or CSV.
        publication: serializePublications(publications),
        contact_email: contactEmail.trim() || null,
        requires_email_gate: requiresGate,
      };
      const res = await fetch(`/api/admin/advertisers/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/30" onClick={onClose} />
      {/* drawer */}
      <div className="w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">CRM contact</div>
            <h2 className="text-xl text-gray-900">{row.name}</h2>
            <div className="text-xs text-gray-500 mt-0.5">{row.slug}</div>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="p-6 space-y-6">
          {/* ── Channel activity tabs (Print / Digital / Email / App) ── */}
          <AdvertiserChannelTabs advertiserId={row.id} />

          {/* ── Status (top-level select, per spec) ─────────────────── */}
          <Section title="Status">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select value={form.status} onChange={(e) => update('status', e.target.value as AdvertiserStatus)} className={INPUT}>
                  {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </Field>
              <Field label="Type">
                <select value={form.type} onChange={(e) => update('type', e.target.value as AdvertiserType)} className={INPUT}>
                  {TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
            </div>
          </Section>

          {/* ── Section One: Company Details ─────────────────────────── */}
          <Section title="Company Details">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company Name" className="col-span-2">
                <input value={form.company} onChange={(e) => update('company', e.target.value)} className={INPUT} placeholder="Company or brand name" />
              </Field>
              <Field label="Address" className="col-span-2">
                <input value={form.address} onChange={(e) => update('address', e.target.value)} className={INPUT} placeholder="Street address" />
              </Field>
              <Field label="Address 2" className="col-span-2">
                <input value={form.address_2} onChange={(e) => update('address_2', e.target.value)} className={INPUT} placeholder="Apt / Suite / Floor" />
              </Field>
              <Field label="City">
                <input value={form.city} onChange={(e) => update('city', e.target.value)} className={INPUT} />
              </Field>
              <Field label="State">
                <input value={form.state} onChange={(e) => update('state', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Zip Code">
                <input value={form.zip} onChange={(e) => update('zip', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Website">
                <input value={form.website} onChange={(e) => update('website', e.target.value)} className={INPUT} placeholder="https://" />
              </Field>
            </div>
          </Section>

          {/* ── Section Two: Representative Details ──────────────────── */}
          <Section title="Representative Details">
            <div className="grid grid-cols-2 gap-3">
              {nameMatch ? (
                <Field label="Name" className="col-span-2">
                  <p className="text-xs text-gray-500 italic">
                    Already in staff: <span className="not-italic font-medium">{nameMatch.name}</span>. Edit in &ldquo;Location &amp; Staff&rdquo; below.
                  </p>
                </Field>
              ) : (
                <>
                  <Field label="First name">
                    <input value={form.first_name} onChange={(e) => update('first_name', e.target.value)} className={INPUT} />
                  </Field>
                  <Field label="Last name">
                    <input value={form.last_name} onChange={(e) => update('last_name', e.target.value)} className={INPUT} />
                  </Field>
                </>
              )}
              <Field label="Title" className="col-span-2">
                <input value={form.title} onChange={(e) => update('title', e.target.value)} className={INPUT} placeholder="Agent, Broker, Owner, etc." />
              </Field>
              {officeMatch ? (
                <Field label="Phone">
                  <p className="text-xs text-gray-500 italic">
                    Already in staff: <span className="not-italic font-medium">{officeMatch.name}</span>.
                  </p>
                </Field>
              ) : (
                <Field label="Phone">
                  <input value={form.office_phone} onChange={(e) => update('office_phone', formatPhoneInput(e.target.value))} className={INPUT} placeholder="(000) 000-0000" inputMode="tel" />
                </Field>
              )}
              {mobileMatch ? (
                <Field label="Mobile">
                  <p className="text-xs text-gray-500 italic">
                    Already in staff: <span className="not-italic font-medium">{mobileMatch.name}</span>.
                  </p>
                </Field>
              ) : (
                <Field label="Mobile">
                  <input value={form.phone} onChange={(e) => update('phone', formatPhoneInput(e.target.value))} className={INPUT} placeholder="(000) 000-0000" inputMode="tel" />
                </Field>
              )}
              {emailMatch ? (
                <Field label="Email" className="col-span-2">
                  <p className="text-xs text-gray-500 italic">
                    Already in staff: <span className="not-italic font-medium">{emailMatch.name}</span>. Edit in &ldquo;Location &amp; Staff&rdquo; below.
                  </p>
                </Field>
              ) : (
                <Field label="Email" className="col-span-2">
                  <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={INPUT} placeholder="name@company.com" inputMode="email" />
                </Field>
              )}
              <Field label="Address" className="col-span-2">
                <input value={form.rep_address} onChange={(e) => update('rep_address', e.target.value)} className={INPUT} placeholder="Street address" />
              </Field>
              <Field label="City">
                <input value={form.rep_city} onChange={(e) => update('rep_city', e.target.value)} className={INPUT} />
              </Field>
              <Field label="State">
                <input value={form.rep_state} onChange={(e) => update('rep_state', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Zip Code">
                <input value={form.rep_zip} onChange={(e) => update('rep_zip', e.target.value)} className={INPUT} />
              </Field>
              <Field label="Industry">
                <input value={form.industry} onChange={(e) => update('industry', e.target.value)} className={INPUT} />
              </Field>
              <Field label="License #">
                <input value={form.license_number} onChange={(e) => update('license_number', e.target.value)} className={INPUT} />
              </Field>
            </div>
          </Section>

          {/* ── Agreement Details (kept as-is) ───────────────────────── */}
          <CurrentContractPanel row={row} />

          {/* ── Ad Management (kept as-is) ───────────────────────────── */}
          <Section title="Ad management">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Publications">
                <div className="flex flex-col gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2">
                  {PUBLICATION_OPTIONS.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={publications.includes(p.id)}
                        onChange={() => togglePublication(p.id)}
                        className="h-4 w-4 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>{p.label}</span>
                    </label>
                  ))}
                  <p className="text-[11px] text-gray-500 mt-1">
                    Pick one or more. Advertisers tagged to a publication appear
                    in that publication&apos;s mailing list and filters.
                  </p>
                </div>
              </Field>
              <Field label="Contact email (share link)">
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className={INPUT}
                  placeholder="contact@example.com"
                />
              </Field>
              <Field label="Email gate" className="col-span-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={requiresGate}
                    onChange={(e) => setRequiresGate(e.target.checked)}
                  />
                  Require email verification before viewing the share link
                </label>
              </Field>
            </div>

            <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-gray-500">Public share link</div>
              <div className="flex gap-2 items-center">
                <input
                  readOnly
                  value={shareUrl}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-mono bg-white"
                />
                <button
                  type="button"
                  onClick={copyShareUrl}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50"
                >
                  {shareCopied ? 'Copied' : 'Copy'}
                </button>
                <button
                  type="button"
                  onClick={rotateShareToken}
                  disabled={shareBusy}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                >
                  {shareBusy ? 'Rotating...' : 'Rotate token'}
                </button>
              </div>
              <Link
                href={`/admin/reports?tab=advertisers&advertiserId=${row.id}`}
                className="inline-block text-xs text-blue-600 hover:underline"
              >
                Open analytics dashboard
              </Link>
            </div>
          </Section>

          {/* ── Public Profile (kept as-is) ──────────────────────────── */}
          <Section title="Public profile">
            <p className="text-xs text-gray-500 mb-3">
              Shown on the public advertiser page at <span className="font-mono">/advertisers/{row.slug}</span>.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Company logo" className="col-span-2">
                <AdvertiserImageUploader
                  value={form.avatar_url}
                  onChange={(url) => update('avatar_url', url)}
                  kind="logo"
                  emptyLabel="logo"
                  onError={onError}
                />
              </Field>
              <Field label="Header style" className="col-span-2">
                <select
                  value={coerceHeaderStyle(form.header_style)}
                  onChange={(e) => update('header_style', coerceHeaderStyle(e.target.value))}
                  className={INPUT}
                >
                  {ADVERTISER_HEADER_STYLES.map((style) => (
                    <option key={style} value={style}>
                      {HEADER_STYLE_META[style].label}
                    </option>
                  ))}
                </select>
                <small className="mt-1 block text-xs text-gray-500">
                  {HEADER_STYLE_META[coerceHeaderStyle(form.header_style)].blurb}
                </small>
              </Field>
              <Field label="Tagline" className="col-span-2">
                <input
                  value={form.tagline}
                  onChange={(e) => update('tagline', e.target.value)}
                  className={INPUT}
                  maxLength={140}
                  placeholder="One-line description shown under the name"
                />
              </Field>
              <Field label="About / Bio" className="col-span-2">
                <textarea
                  value={form.bio}
                  onChange={(e) => update('bio', e.target.value)}
                  className={INPUT + ' min-h-[100px]'}
                  rows={4}
                  placeholder="Longer description for the public page"
                />
              </Field>
              <Field label="Facebook URL" className="col-span-2">
                <input value={form.facebook_url} onChange={(e) => update('facebook_url', e.target.value)} className={INPUT} placeholder="https://facebook.com/..." />
              </Field>
              <Field label="Instagram URL" className="col-span-2">
                <input value={form.instagram_url} onChange={(e) => update('instagram_url', e.target.value)} className={INPUT} placeholder="https://instagram.com/..." />
              </Field>
              <Field label="LinkedIn URL" className="col-span-2">
                <input value={form.linkedin_url} onChange={(e) => update('linkedin_url', e.target.value)} className={INPUT} placeholder="https://linkedin.com/..." />
              </Field>
              <Field label="X / Twitter URL" className="col-span-2">
                <input value={form.twitter_url} onChange={(e) => update('twitter_url', e.target.value)} className={INPUT} placeholder="https://x.com/..." />
              </Field>
              <Field label="YouTube URL" className="col-span-2">
                <input value={form.youtube_url} onChange={(e) => update('youtube_url', e.target.value)} className={INPUT} placeholder="https://youtube.com/..." />
              </Field>
            </div>
          </Section>

          {/* ── Portal Access (kept as-is) ───────────────────────────── */}
          <Section title="Portal access">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Magic link</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Single-use, valid 24h. Sends to{' '}
                    <span className="font-mono text-gray-700">
                      {row.portal_email || row.contact_email || '— no email on file'}
                    </span>.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => sendPortalLink('login')}
                  disabled={sendingLink || (!row.portal_email && !row.contact_email)}
                  className="shrink-0 rounded-md bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {sendingLink ? 'Sending…' : 'Send portal link'}
                </button>
              </div>
              {linkResult?.error && (
                <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-xs">
                  {linkResult.error}
                </div>
              )}
              {linkResult?.url && (
                <div className="space-y-1">
                  <div className="text-xs text-gray-600">
                    {linkResult.status === 'sent'
                      ? '✓ Email sent.'
                      : linkResult.status === 'failed'
                      ? '✕ Email failed — copy URL below:'
                      : 'Email skipped — copy URL below:'}
                  </div>
                  <input
                    readOnly
                    value={linkResult.url}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs font-mono"
                  />
                </div>
              )}
            </div>
          </Section>

          {/* ── Event Submission Link (kept as-is) ───────────────────── */}
          <Section title="Event submission link">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-gray-900">Public submission form</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Share this URL with the advertiser so they can submit
                    events directly into the review queue. Each submission
                    lands in the Events queue for your approval.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={regenerateSubmissionToken}
                  disabled={tokenBusy}
                  className="shrink-0 rounded-md bg-gray-900 text-white px-3 py-1.5 text-sm hover:bg-gray-800 disabled:opacity-50"
                >
                  {tokenBusy
                    ? 'Working…'
                    : submissionToken
                    ? 'Regenerate'
                    : 'Generate link'}
                </button>
              </div>
              {tokenError && (
                <div className="rounded-md bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-xs">
                  {tokenError}
                </div>
              )}
              {submissionUrl ? (
                <div className="space-y-1">
                  <div className="flex gap-2 items-center">
                    <input
                      readOnly
                      value={submissionUrl}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs font-mono"
                    />
                    <button
                      type="button"
                      onClick={copySubmissionUrl}
                      className="shrink-0 rounded-md border border-gray-300 px-2 py-1 text-xs bg-white hover:bg-gray-50"
                    >
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <a
                    href={submissionUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-blue-600 underline"
                  >
                    Open form in new tab ↗
                  </a>
                </div>
              ) : (
                <div className="text-xs text-gray-500">
                  No link yet — click Generate to issue one.
                </div>
              )}
            </div>
          </Section>

          {/* ── Location & Staff (kept as-is) ────────────────────────── */}
          <Section title="Location & Staff">
            <LocationsStaffEditor
              advertiserId={row.id}
              onError={(msg) => onError(msg)}
              onStaffChange={setEditorStaff}
            />
          </Section>

          {/* ── Tags & Notes (kept as-is) ────────────────────────────── */}
          <Section title="Tags & Notes">
            <Field label="Tags (comma-separated)">
              <input value={form.tags} onChange={(e) => update('tags', e.target.value)} className={INPUT} placeholder="vip, repeat, annual-contract" />
            </Field>
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(e) => update('notes', e.target.value)}
                rows={4}
                className={`${INPUT} resize-y`}
              />
            </Field>
          </Section>

          <div className="sticky bottom-0 -mx-6 px-6 py-4 bg-white border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="text-xs text-gray-500">
                Last updated {row.updated_at ? new Date(row.updated_at).toLocaleString() : '-'}
              </div>
              <button
                type="button"
                onClick={deleteAdvertiser}
                disabled={deleting}
                className="px-3 py-1.5 rounded-md border border-red-200 text-red-700 text-xs hover:bg-red-50 disabled:opacity-50"
                title="Delete this advertiser (hotspots remain, links unlinked)"
              >
                {deleting ? 'Deleting...' : 'Delete advertiser'}
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={saving}
                className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const INPUT = 'w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="text-xs uppercase tracking-[0.2em] text-gray-500 font-medium">{title}</div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children, className = '' }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <div className="text-xs text-gray-600 mb-1">{label}</div>
      {children}
    </label>
  );
}

// Read-only mirror of the advertiser's current agreement. All fields below
// are sourced from the `advertisers` row (mirror columns kept in lockstep
// with `agreements` by lib/server/billing-crm-sync.ts). To edit any of
// these, open the Billing agreement — changes flow back here on save.
function CurrentContractPanel({ row }: { row: AdvertiserCrmRow }) {
  const fmtCents = (c: number | null | undefined): string => {
    if (c == null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(c / 100);
  };
  const fmtDate = (d: string | null | undefined): string => {
    if (!d) return '—';
    try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch { return d; }
  };
  const txt = (v: string | null | undefined): string => (v && v.trim()) ? v : '—';

  const hasAgreement = !!row.current_agreement_id;
  const hasAnyBilling =
    !!(row.billing_contact_name || row.billing_contact_phone || row.billing_email
       || row.payment_mode || row.card_last4 || row.stripe_customer_id);

  return (
    <Section title="Current contract (Billing)">
      {!hasAgreement && !hasAnyBilling ? (
        <p className="text-xs text-gray-500 italic">
          No agreement linked yet. Create or sign one from{' '}
          <a href="/admin/agreements" className="text-blue-600 hover:underline">/admin/agreements</a>{' '}
          and it will appear here automatically.
        </p>
      ) : (
        <>
          <p className="text-xs text-gray-500 mb-3">
            Read-only mirror of the advertiser&rsquo;s most recent active-ish agreement.
            To edit, open{' '}
            {row.current_agreement_id ? (
              <a href={`/admin/agreements?id=${row.current_agreement_id}`} className="text-blue-600 hover:underline">/admin/agreements</a>
            ) : (
              <a href="/admin/agreements" className="text-blue-600 hover:underline">/admin/agreements</a>
            )}
            {' '}— saves there flow back here.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ad size">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{txt(row.current_ad_size)}</div>
            </Field>
            <Field label="Frequency">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{txt(row.current_frequency)}</div>
            </Field>
            <Field label="Ad rate">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{fmtCents(row.current_ad_rate_cents)}</div>
            </Field>
            <Field label="Contract total">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{fmtCents(row.current_amount_cents)}</div>
            </Field>
            <Field label="Expires">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{fmtDate(row.current_exp_date)}</div>
            </Field>
            <Field label="Payment mode">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{txt(row.payment_mode)}</div>
            </Field>
            <Field label="Billing contact">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{txt(row.billing_contact_name)}</div>
            </Field>
            <Field label="Billing phone">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{txt(row.billing_contact_phone)}</div>
            </Field>
            <Field label="Billing email" className="col-span-2">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">{txt(row.billing_email)}</div>
            </Field>
            <Field label="Card on file">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm">
                {row.card_last4 ? `•••• ${row.card_last4}` : '—'}
              </div>
            </Field>
            <Field label="Stripe customer">
              <div className="px-3 py-2 rounded-md border border-gray-200 bg-gray-50 text-sm font-mono text-xs">
                {txt(row.stripe_customer_id)}
              </div>
            </Field>
          </div>
        </>
      )}
    </Section>
  );
}

// Create-advertiser modal: minimal form (name + publication + optional
// contact email + gate). Replaces the legacy /admin/advertisers modal.
function CreateAdvertiserModal({
  onClose,
  onCreated,
  onError,
}: {
  onClose: () => void;
  onCreated: () => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState('');
  const [publications, setPublications] = useState<PublicationKey[]>(['austin']);
  const togglePublication = (key: PublicationKey) => {
    setPublications((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      if (next.length === 0) return ['austin'];
      return PUBLICATION_KEYS.filter((k) => next.includes(k));
    });
  };
  const [contactEmail, setContactEmail] = useState('');
  const [requiresGate, setRequiresGate] = useState(false);
  const [status, setStatus] = useState<AdvertiserStatus>('prospect');
  const [saving, setSaving] = useState(false);

  const save = useCallback(async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/admin/advertisers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contact_email: contactEmail.trim() || null,
          requires_email_gate: requiresGate,
          publication: serializePublications(publications),
          status,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      await onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'save failed');
    } finally {
      setSaving(false);
    }
  }, [name, publications, contactEmail, requiresGate, status, onCreated, onError]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-md bg-white shadow-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">New advertiser</h2>
          <p className="text-xs text-gray-500 mt-0.5">Create the contact record. You can fill in everything else from the edit drawer afterwards.</p>
        </div>
        <div className="p-5 space-y-4">
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. La Cima"
              disabled={saving}
              autoFocus
            />
          </label>
          <div className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Publications</span>
            <div className="flex flex-col gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-2">
              {PUBLICATION_OPTIONS.map((opt) => (
                <label key={opt.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={publications.includes(opt.id)}
                    onChange={() => togglePublication(opt.id)}
                    disabled={saving}
                    className="h-4 w-4 rounded-md border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>{opt.label}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">Check one or more publications this advertiser belongs to.</p>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as AdvertiserStatus)}
              disabled={saving}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="prospect">Prospect</option>
              <option value="advertiser">Advertiser</option>
            </select>
            <p className="text-[11px] text-gray-500">Use Prospect for leads, Advertiser once they are active.</p>
          </label>
          <label className="block space-y-1">
            <span className="text-sm font-medium text-gray-700">Contact email</span>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="contact@example.com"
              disabled={saving}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={requiresGate}
              onChange={(e) => setRequiresGate(e.target.checked)}
              disabled={saving}
            />
            Require email gate before viewing share link
          </label>
        </div>
        <div className="px-5 py-4 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
            disabled={saving || !name.trim()}
          >
            {saving ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

