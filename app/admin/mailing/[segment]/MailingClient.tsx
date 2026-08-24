'use client';

// app/admin/mailing/[segment]/MailingClient.tsx
//
// Client UI for one mailing segment, styled to match the ABOR Members
// (holding) page:
//   - 5-card KPI strip (Total / Verified / Pending / Within 60 mi / Outside 60 mi)
//   - Filter chips (all / verified / pending)
//   - Sortable columns + Proximity / Address / Email verify columns
//   - Row click -> side drawer with every editable field + verify buttons
//   - Real per-row verify buttons:
//       Address -> /api/admin/mailing/verify-address (stage-agnostic USPS)
//       Email   -> /api/admin/mailing/verify-email   (stage-agnostic SMTP)
//   - Bulk "Verify USPS (N)" over selected rows / current page
//   - Secondary actions row: Add / Import / Export / Dedupe / Delete-all
//
// Promote / Reject and the verify-all-Pending drain are holding-only
// concepts; the drain button is rendered disabled ("Coming soon for this
// segment") for visual parity, and Promote/Reject are omitted entirely.

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useUrlNumber, useUrlState, useUrlString } from '@/lib/use-url-state';
import {
  isSaborSegment,
  guessField,
  splitFullName,
  SEGMENTS,
  type MailingColumnId,
  type MailingContactRow,
  type MailingSegment,
  type CanonicalImportField,
  type VerifyStatus,
} from '@/lib/mailing';
import { formatPhone, formatPhoneInput } from '@/lib/format-phone';
import { toTitleCaseName, toTitleCaseRole } from '@/lib/format-name';

import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';
import ExportMenu from '@/components/admin/ExportMenu';
import { Pager } from '@/app/admin/_components/Pager'  // imports below extended;
import { PAGE_SIZE_OPTIONS } from '@/app/admin/_components/Pager';
import { pollJob } from '@/app/admin/_hooks/useBulkSelection';
type Stats = { total: number; verified: number; pending: number; near: number; far: number };
type FilterKey = 'all' | 'verified' | 'pending';

type Props = {
  segment: MailingSegment;
  slug: string;
  label: string;
  accent: string;
};

const DEFAULT_PAGE_SIZE = 100;
const NEAR_RADIUS_MI = 60;
const SORTABLE: MailingColumnId[] = [
  'first_name', 'last_name', 'email', 'company', 'city', 'state', 'created_at',
];

// ---------------------------------------------------------------------------
// Column visibility registry
// `name` is always shown (it's the primary anchor for the row); everything
// else is user-toggleable and persisted in localStorage per session.
// ---------------------------------------------------------------------------
type ColumnId =
  | 'name'
  | 'email'
  | 'phone'
  | 'company'
  | 'city'
  | 'proximity'
  | 'address'
  | 'email_verify'
  | 'tag';

type ColumnDef = { id: ColumnId; label: string; alwaysOn?: boolean };

const COLUMNS: ColumnDef[] = [
  { id: 'name',         label: 'Name',      alwaysOn: true },
  { id: 'tag',          label: 'Tag' },
  { id: 'email',        label: 'Email' },
  { id: 'phone',        label: 'Phone' },
  { id: 'company',      label: 'Company' },
  { id: 'city',         label: 'City' },
  { id: 'proximity',    label: 'Proximity' },
  { id: 'address',      label: 'Address (USPS)' },
  { id: 'email_verify', label: 'Email (SMTP)' },
];

const DEFAULT_VISIBLE: Record<ColumnId, boolean> = {
  name: true, tag: true, email: true, phone: true, company: true, city: true,
  proximity: true, address: true, email_verify: true,
};

const COLUMNS_LS_KEY = 'mailing.columns.v1';

function loadColumnVisibility(): Record<ColumnId, boolean> {
  if (typeof window === 'undefined') return DEFAULT_VISIBLE;
  try {
    const raw = window.localStorage.getItem(COLUMNS_LS_KEY);
    if (!raw) return DEFAULT_VISIBLE;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_VISIBLE;
    const merged = { ...DEFAULT_VISIBLE };
    for (const c of COLUMNS) {
      const v = (parsed as Record<string, unknown>)[c.id];
      if (typeof v === 'boolean') merged[c.id] = v;
    }
    // alwaysOn columns can never be hidden
    for (const c of COLUMNS) if (c.alwaysOn) merged[c.id] = true;
    return merged;
  } catch {
    return DEFAULT_VISIBLE;
  }
}

export default function MailingClient({ segment, slug, label, accent }: Props) {
  const [rows, setRows] = useState<MailingContactRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Search / filter / sort / pagination are URL-backed so refresh keeps the
  // exact same slice of contacts on screen.
  const [search, setSearch] = useUrlState<string>('q', '', {
    parse: (raw) => raw ?? '',
    stringify: (v) => (v ? v : null),
  });
  const [filter, setFilter] = useUrlString<FilterKey>('filter', 'all');
  // Tag filter for the merged print segments (realtyline-atx-print and
  // newsline-sa-print). 'all' shows every row; the rest filter by tag.
  // SA also has a 'manual' bucket for the legacy Manual Newsline rows.
  // Ignored on every other segment.
  const [tagFilter, setTagFilter] = useUrlString<'all' | 'active-advertiser' | 'non-advertiser' | 'manual' | 'REALTOR' | 'Loan Officer' | 'Business Development'>('tag', 'all');
  const [sort, setSort] = useUrlString<MailingColumnId>('sort', 'created_at');
  const [dir, setDir] = useUrlString<'asc' | 'desc'>('dir', 'desc');
  const [offset, setOffset] = useUrlNumber('offset', 0);
  const [pageSize, setPageSize] = useUrlNumber('pageSize', DEFAULT_PAGE_SIZE);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // filterAll === true means "every row matching the current segment+search+filter"
  // is selected, not just the IDs on this page. Bulk delete/move with
  // filterAll uses the async /bulk-async route and polls a job row.
  const [filterAll, setFilterAll] = useState<boolean>(false);
  const [jobProgress, setJobProgress] = useState<{ processed: number; total: number | null } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<MailingContactRow | null>(null);

  // Column visibility. Loaded lazily from localStorage on the first client
  // render; saved on every change. The lazy initializer runs once and
  // mirrors the value we'd otherwise reconcile in an effect (avoiding the
  // react-hooks/set-state-in-effect lint rule).
  const [visibleCols, setVisibleCols] = useState<Record<ColumnId, boolean>>(
    () => loadColumnVisibility(),
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(COLUMNS_LS_KEY, JSON.stringify(visibleCols)); } catch {}
  }, [visibleCols]);
  // 'tag' column shows on every Mailing Hub child page so the REALTOR /
  // Loan Officer / Business Development library tags are visible everywhere.
  // The merged print segments also show their per-segment audience tags
  // (active-advertiser / non-advertiser / manual).
  const HUB_TAGGED_SEGMENTS: MailingSegment[] = [
    'realtyline-atx-print',
    'newsline-sa-print',
    'email-only-atx',
    'email-only-sa',
    'realtor',
  ];
  const isHubTagged = HUB_TAGGED_SEGMENTS.includes(segment);
  const isVisible = (id: ColumnId) => {
    if (id === 'tag') {
      return isHubTagged && visibleCols[id];
    }
    return visibleCols[id];
  };

  // verify-all-pending drain state. Holding-only for now; the button is
  // rendered disabled so the visual stays in parity without backend work.
  const [drainJob] = useState<{
    id:        string;
    total:     number;
    processed: number;
    valid:     number;
    invalid:   number;
    pending:   number;
    remaining: number;
    status:    'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  } | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        segment,
        filter,
        sort,
        dir,
        limit: String(pageSize),
        offset: String(offset),
      });
      if (search.trim()) params.set('search', search.trim());
      if (isHubTagged && tagFilter !== 'all') {
        params.set('tag', tagFilter);
      }
      const res = await fetch(`/api/admin/mailing?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as {
        rows: MailingContactRow[]; total: number; counts: unknown; stats?: Stats;
      };
      setRows(data.rows);
      setTotal(data.total);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segment, filter, sort, dir, offset, search, pageSize, tagFilter]);

  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);
  useEffect(() => { queueMicrotask(() => setMounted(true)); }, []);

  useEffect(() => {
    const t = setTimeout(() => { queueMicrotask(() => { setOffset(0); setFilterAll(false); }); }, 300);
    return () => clearTimeout(t);
    // setOffset is now returned from useUrlState — stable via useCallback but
    // eslint can't verify that. Same story for setFilterAll (plain useState).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- setOffset stable via useUrlState/useCallback
  useEffect(() => { queueMicrotask(() => { setOffset(0); setSelectedIds(new Set()); setFilterAll(false); }); }, [filter, segment]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 5000);
  };

  // Locally patch a single row in `rows` after an API call returns it.
  const mergeRow = useCallback((row: MailingContactRow) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
    setEditing((prev) => (prev && prev.id === row.id ? row : prev));
  }, []);

  const handleSort = (col: MailingColumnId) => {
    if (!SORTABLE.includes(col)) return;
    if (sort === col) {
      setDir(dir === 'asc' ? 'desc' : 'asc');
    } else {
      setSort(col);
      setDir('asc');
    }
  };

  const handleSelect = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id); else next.delete(id);
    setSelectedIds(next);
  };
  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedIds(new Set(rows.map((r) => r.id)));
    else setSelectedIds(new Set());
  };

  const verifyAddress = async (id: string) => {
    setBusy(`addr-${id}`);
    try {
      const res = await fetch('/api/admin/mailing/verify-address', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      if (j.row) mergeRow(j.row);
      const verdict = j.verdict ?? 'Unknown';
      // San Antonio segments (manual-newsline, active-advertiser-sa, non-advertiser-sa)
      // anchor on SABOR. Austin segments anchor on ABoR. Show whichever applies in the toast.
      const isSabor = isSaborSegment(segment);
      const distVal = isSabor
        ? j.distance_sabor_mi
        : j.distance_abor_mi;
      const anchorLabel = isSabor ? 'SABOR' : 'ABoR';
      const extra = verdict === 'Valid' && distVal !== null && distVal !== undefined
        ? ` · ${Number(distVal).toFixed(1)} mi from ${anchorLabel}`
        : '';
      showToast(`Address: ${verdict}${extra}${j.detail ? ` — ${j.detail}` : ''}`);
      await reload();
    } catch (err) {
      showToast(`Address verify failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const verifyEmail = async (id: string) => {
    setBusy(`email-${id}`);
    try {
      const res = await fetch('/api/admin/mailing/verify-email', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      if (j.row) mergeRow(j.row);
      // Build a richer toast surfacing the most actionable signals.
      const extras: string[] = [];
      const s = j.signals as {
        disposable?: boolean; roleAccount?: boolean;
        freeProvider?: boolean; catchAll?: boolean | null;
        smtpTimedOut?: boolean; smtpConnected?: boolean;
        mxAttempts?: number;
      } | undefined;
      if (s?.disposable)   extras.push('disposable provider');
      if (s?.catchAll)     extras.push('catch-all domain');
      if (s?.freeProvider) extras.push('free-mail provider');
      if (s?.roleAccount)  extras.push('role account');
      if (s?.smtpTimedOut && !s?.smtpConnected) {
        extras.push(`mail server timed out${s.mxAttempts ? ` (${s.mxAttempts} MX)` : ''}`);
      }
      if (j.suggestion)    extras.push(`did you mean @${j.suggestion}?`);
      const tag = extras.length ? ` · ${extras.join(' · ')}` : '';
      showToast(`Email: ${j.verdict ?? 'Unknown'}${j.detail ? ` — ${j.detail}` : ''}${tag}`);
      await reload();
    } catch (err) {
      showToast(`Email verify failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  // ------------------------------------------------------------------
  // Bulk USPS verify — selected rows, or all rows on the current page
  // if nothing is selected. USPS v3 is single-address per request, so
  // we loop, throttled to ~5/sec.
  // ------------------------------------------------------------------
  async function handleVerifyAddresses() {
    const targets = selectedIds.size > 0
      ? rows.filter((r) => selectedIds.has(r.id))
      : rows;
    const candidates = targets.filter((r) => (r.address ?? '').trim().length > 0);
    if (candidates.length === 0) {
      alert('No rows with a street address to verify.');
      return;
    }
    const scope = selectedIds.size > 0 ? `${candidates.length} selected` : `${candidates.length} on this page`;
    if (!confirm(`Run USPS address verification on ${scope}? Valid rows will be overwritten with the USPS-standardized form.`)) return;

    let valid = 0;
    let invalid = 0;
    let errors = 0;
    for (let i = 0; i < candidates.length; i++) {
      const r = candidates[i];
      setBusy(`Verifying ${i + 1}/${candidates.length}\u2026`);
      try {
        const res = await fetch('/api/admin/mailing/verify-address', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: r.id }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) {
          errors++;
          console.error('[verify-address]', r.id, j?.detail || j?.error || res.status);
        } else if (j.verdict === 'Valid') {
          valid++;
        } else if (j.verdict === 'Invalid') {
          invalid++;
        }
      } catch (err) {
        errors++;
        console.error('[verify-address]', r.id, err);
      }
      // Throttle to ~5 req/sec to stay friendly to USPS API.
      await new Promise((res) => setTimeout(res, 200));
    }
    setBusy(null);
    alert(`USPS verify complete \u2014 Valid ${valid}, Invalid ${invalid}, Errors ${errors}.`);
    await reload();
  }

  async function handleMove(target: MailingSegment) {
    if (selectedIds.size === 0) return;
    if (target === segment) {
      alert('Those contacts are already in this list.');
      return;
    }
    const targetLabel = SEGMENTS.find((s) => s.segment === target)?.label ?? target;
    if (!confirm(`Move ${selectedIds.size} contact(s) to "${targetLabel}"?`)) return;
    setBusy('Moving\u2026');
    try {
      const res = await fetch('/api/admin/mailing/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'move',
          ids: Array.from(selectedIds),
          target_segment: target,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const j = await res.json() as { moved: number };
      alert(`Moved ${j.moved.toLocaleString()} contact(s) to ${targetLabel}.`);
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} contact(s)? This cannot be undone.`)) return;
    setBusy('Deleting\u2026');
    try {
      const res = await fetch('/api/admin/mailing/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }


  // ------------------------------------------------------------------
  // Filter-mode bulk actions. Used when the user clicks "Select all M
  // matching this filter" — we don't ship IDs over the wire; the server
  // re-derives the row set from segment+search+filter, then runs the
  // mutation in a background worker. We poll /api/admin/jobs/[id] for
  // progress and refresh once it lands.
  // ------------------------------------------------------------------
  async function runFilterBulk(action: 'delete' | 'move', targetSegment?: MailingSegment) {
    const expected = total;
    if (expected <= 0) return;
    const targetLabel = targetSegment
      ? (SEGMENTS.find((s) => s.segment === targetSegment)?.label ?? targetSegment)
      : '';
    const verb = action === 'delete' ? 'Delete' : `Move to "${targetLabel}"`;
    const phrase = action === 'delete'
      ? `permanently DELETE all ${expected.toLocaleString()} contact(s) matching this filter`
      : `MOVE all ${expected.toLocaleString()} contact(s) matching this filter to "${targetLabel}"`;
    const typed = window.prompt(
      `\u26a0 This will ${phrase}. This cannot be undone.\n\nType ${action.toUpperCase()} to confirm:`,
    );
    if (typed !== action.toUpperCase()) return;

    setBusy(`${verb}\u2026`);
    setJobProgress({ processed: 0, total: expected });
    try {
      const res = await fetch('/api/admin/mailing/bulk-async', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          scope: { segment, query: search.trim(), filter },
          target_segment: targetSegment,
          expected_count: expected,
          confirm: 'BULK_FILTER',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        if (res.status === 409 && j?.actual != null) {
          throw new Error(
            `The matching row count changed since you selected (now ${Number(j.actual).toLocaleString()}, was ${Number(j.expected ?? expected).toLocaleString()}). Reload and try again.`,
          );
        }
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const { job_id, estimated_total } = await res.json() as { job_id: string; estimated_total: number };
      setJobProgress({ processed: 0, total: estimated_total });
      const final = await pollJob(job_id, (p) => {
        setJobProgress({ processed: p.processed, total: p.total ?? estimated_total });
        setBusy(`${verb} ${p.processed.toLocaleString()}/${(p.total ?? estimated_total).toLocaleString()}\u2026`);
      });
      if (final.status === 'failed') {
        throw new Error(final.error || 'Background job failed.');
      }
      alert(`${action === 'delete' ? 'Deleted' : 'Moved'} ${final.processed.toLocaleString()} contact(s).`);
      setSelectedIds(new Set());
      setFilterAll(false);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      setJobProgress(null);
    }
  }

  async function handleFilterDelete() { await runFilterBulk('delete'); }
  async function handleFilterMove(target: MailingSegment) {
    if (target === segment) {
      alert('Those contacts are already in this list.');
      return;
    }
    await runFilterBulk('move', target);
  }

  async function handleDeleteAllInSegment() {
    const inSegment = stats?.total ?? 0;
    if (inSegment === 0) {
      alert(`No contacts in ${label} to delete.`);
      return;
    }
    const first = window.prompt(
      `\u26a0 This will permanently delete ALL ${inSegment.toLocaleString()} contact(s) in ${label}. ` +
        `This cannot be undone.\n\nType DELETE to confirm:`,
    );
    if (first !== 'DELETE') return;
    if (!confirm(`Final check: delete all ${inSegment.toLocaleString()} contacts in ${label}?`)) return;
    setBusy('Deleting all\u2026');
    try {
      const res = await fetch('/api/admin/mailing/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-all-in-segment',
          segment,
          confirm: 'DELETE_ALL',
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const j = (await res.json()) as { removed: number };
      alert(`Deleted ${j.removed.toLocaleString()} contact(s) from ${label}.`);
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleDedupe() {
    if (!confirm(`Dedupe ${label}? Rows with the same email (or name+phone) will be merged, keeping the oldest.`)) return;
    setBusy('Deduping\u2026');
    try {
      const res = await fetch('/api/admin/mailing/bulk', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dedupe', segment }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const j = await res.json() as { removed: number };
      alert(`Removed ${j.removed} duplicate(s).`);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  function handleExport(format: 'csv' | 'tsv' | 'json') {
    const url = `/api/admin/mailing/export?segment=${encodeURIComponent(slug)}&format=${format}`;
    // Use a same-tab anchor click so popup blockers don't swallow it and
    // so the admin cookie definitely travels with the request.
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.target = '_self';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function handleRefreshAddresses(force: boolean) {
    const msg = force
      ? `Force overwrite every address in ${label} with the canonical address from each advertiser's locations? Admin edits will be replaced.`
      : `Fill in blank address fields in ${label} from each advertiser's locations? Admin edits are preserved.`;
    if (!confirm(msg)) return;
    setBusy(force ? 'Overwriting addresses\u2026' : 'Refreshing addresses\u2026');
    try {
      const res = await fetch('/api/admin/mailing/refresh-addresses', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, force }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const j = await res.json() as {
        scanned: number;
        updated: number;
        skippedNoAdvertiser: number;
        skippedComplete: number;
      };
      showToast(
        `Scanned ${j.scanned} · updated ${j.updated} · skipped ${j.skippedComplete} complete, ${j.skippedNoAdvertiser} no advertiser`,
      );
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <MailingBreadcrumb trail={[{ label: 'Mailing', href: '/admin/mailing' }, { label }]} />
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
              Audience
            </p>
            <PageTitle size="md">{label}</PageTitle>
            <p className="mt-2 text-sm text-gray-600 max-w-2xl">
              Click any row to edit details, verify the mailing address through
              USPS, or verify the email. Use the filters below to focus on
              verified or pending contacts.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled
              title="Coming soon for this segment"
              className="px-4 py-2 rounded-md border border-brand-700 text-brand-700 text-sm font-medium opacity-50 cursor-not-allowed whitespace-nowrap"
            >
              Verify all Pending
            </button>
            <button
              type="button"
              onClick={handleVerifyAddresses}
              disabled={busy !== null}
              className="px-4 py-2 rounded-md text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: '#301D5D' }}
              title="Run USPS Address API on selected rows (or this page if none selected)"
            >
              Verify USPS{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
          </div>
        </div>
      </div>

      {/* Secondary actions row */}
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
          + Add contact
        </button>
        <button onClick={() => setShowImport(true)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
          Import
        </button>
        <ExportMenu disabled={busy !== null} onSelect={handleExport} />
        <button onClick={handleDedupe} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 whitespace-nowrap">
          Dedupe
        </button>
        {(segment === 'active-advertiser-atx' || segment === 'active-advertiser-sa' || segment === 'realtyline-atx-print' || segment === 'newsline-sa-print') && (
          <div className="relative inline-block group">
            <button
              onClick={() => handleRefreshAddresses(false)}
              disabled={busy !== null}
              className="px-3 py-1.5 text-sm rounded-md border border-brand-700 text-brand-700 hover:bg-brand-700/5 disabled:opacity-50"
              title="Walk every row and fill in blank address fields from the linked advertiser's locations (preferring each staff member's assigned location). Preserves admin edits."
            >
              Refresh addresses from advertisers
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10 bg-white border border-gray-200 rounded-md shadow-sm py-1 min-w-[220px]">
              <button
                onClick={() => handleRefreshAddresses(false)}
                disabled={busy !== null}
                className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Fill blanks only (safe)
              </button>
              <button
                onClick={() => handleRefreshAddresses(true)}
                disabled={busy !== null}
                className="block w-full text-left px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Force overwrite all
              </button>
            </div>
          </div>
        )}
        <button
          onClick={handleDeleteAllInSegment}
          className="px-4 py-2 text-sm rounded-md border border-red-300 text-red-700 hover:bg-red-50 whitespace-nowrap"
        >
          Delete all
        </button>
        <div className="flex-1" />
        <ColumnsDropdown visible={visibleCols} onChange={setVisibleCols} />
      </div>

      {/* Verify-drain progress strip (holding-only; inert here) */}
      {drainJob && (
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">
                Verify drain
              </p>
              <p className="font-serif text-lg text-gray-900 mt-0.5">
                {drainJob.processed.toLocaleString()} / {drainJob.total.toLocaleString()} processed
              </p>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-brand-700 transition-all"
              style={{
                width: `${drainJob.total > 0 ? Math.min(100, Math.round((drainJob.processed / drainJob.total) * 100)) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="In segment"    value={stats?.total    ?? 0} sub="all contacts"             accent={accent} />
        <KpiCard label="Verified"      value={stats?.verified ?? 0} sub="address or email valid"   accent="#f97316" />
        <KpiCard label="Pending"       value={stats?.pending  ?? 0} sub="needs verification"       accent="#f97316" />
        <KpiCard
          label="Within 60 mi"
          value={stats?.near ?? 0}
          sub={isSaborSegment(segment) ? 'near SABOR' : 'near ABoR or Five Points'}
          accent="#ea580c"
          action={(stats?.near ?? 0) > 0 ? {
            label: 'Export CSV',
            onClick: () => {
              const a = document.createElement('a');
              a.href = `/api/admin/mailing/export-near?segment=${encodeURIComponent(segment)}`;
              a.rel = 'noopener';
              document.body.appendChild(a);
              a.click();
              a.remove();
            },
          } : undefined}
        />
        <KpiCard
          label="Outside 60 mi"
          value={stats?.far ?? 0}
          sub={segment === 'manual-newsline' ? 'beyond SABOR 60 mi' : 'out of both radii'}
          accent="#9ca3af"
        />
      </div>

      {/* Filter chips + search */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={filter === 'all'}      onClick={() => setFilter('all')}      label="All"      count={stats?.total ?? 0} />
        <FilterChip active={filter === 'verified'} onClick={() => setFilter('verified')} label="Verified" count={stats?.verified ?? 0} accent="#f97316" />
        <FilterChip active={filter === 'pending'}  onClick={() => setFilter('pending')}  label="Pending"  count={stats?.pending ?? 0}  accent="#f97316" />

        {(segment === 'realtyline-atx-print' || segment === 'newsline-sa-print') && (
          <>
            <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />
            <FilterChip
              active={tagFilter === 'all'}
              onClick={() => { setTagFilter('all'); setOffset(0); }}
              label="All tags"
              count={stats?.total ?? 0}
            />
            <FilterChip
              active={tagFilter === 'active-advertiser'}
              onClick={() => { setTagFilter('active-advertiser'); setOffset(0); }}
              label="Active Advertiser"
              count={tagFilter === 'active-advertiser' ? total : 0}
              accent="#c2410c"
            />
            <FilterChip
              active={tagFilter === 'non-advertiser'}
              onClick={() => { setTagFilter('non-advertiser'); setOffset(0); }}
              label="Non-Advertiser"
              count={tagFilter === 'non-advertiser' ? total : 0}
              accent="#9a3412"
            />
            {segment === 'newsline-sa-print' && (
              <FilterChip
                active={tagFilter === 'manual'}
                onClick={() => { setTagFilter('manual'); setOffset(0); }}
                label="Manual"
                count={tagFilter === 'manual' ? total : 0}
                accent="#301D5D"
              />
            )}
          </>
        )}

        {(segment === 'realtyline-atx-print'
          || segment === 'newsline-sa-print'
          || segment === 'email-only-atx'
          || segment === 'email-only-sa'
          || segment === 'realtor') && (
          <>
            <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />
            <FilterChip
              active={tagFilter === 'REALTOR'}
              onClick={() => { setTagFilter('REALTOR'); setOffset(0); }}
              label="REALTOR"
              count={tagFilter === 'REALTOR' ? total : 0}
              accent="#16a34a"
            />
            <FilterChip
              active={tagFilter === 'Loan Officer'}
              onClick={() => { setTagFilter('Loan Officer'); setOffset(0); }}
              label="Loan Officer"
              count={tagFilter === 'Loan Officer' ? total : 0}
              accent="#d97706"
            />
            <FilterChip
              active={tagFilter === 'Business Development'}
              onClick={() => { setTagFilter('Business Development'); setOffset(0); }}
              label="Business Development"
              count={tagFilter === 'Business Development' ? total : 0}
              accent="#475569"
            />
          </>
        )}

        <div className="flex-1" />

        <input
          type="search"
          placeholder="Search name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-md border border-gray-300 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-brand-700"
        />
      </div>

      {mounted && filterAll && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-indigo-50 border border-indigo-200">
          <span className="text-sm text-indigo-900 font-medium">All {total.toLocaleString()} matching this filter selected.</span>
          <div className="flex-1" />
          <MoveToMenu
            currentSegment={segment}
            disabled={busy !== null}
            count={total}
            onMove={(target) => handleFilterMove(target)}
          />
          <button
            type="button"
            onClick={handleFilterDelete}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-md border border-red-300 text-red-700 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
          >
            Delete {total.toLocaleString()}
          </button>
          <button
            type="button"
            onClick={() => { setFilterAll(false); setSelectedIds(new Set()); }}
            className="px-3 py-1.5 rounded-md text-indigo-700 text-xs hover:text-indigo-900"
          >
            Clear
          </button>
        </div>
      )}

      {mounted && !filterAll && selectedIds.size > 0 && allSelected && total > rows.length && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-indigo-50 border border-indigo-100 text-sm">
          <span className="text-indigo-900">All {selectedIds.size} on this page selected.</span>
          <button
            type="button"
            onClick={() => { setFilterAll(true); setSelectedIds(new Set()); }}
            className="text-indigo-700 font-medium underline underline-offset-2 hover:text-indigo-900"
          >
            Select all {total.toLocaleString()} matching this filter
          </button>
        </div>
      )}

      {jobProgress && (
        <div className="px-4 py-2 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-900">
          Working in background\u2026 {jobProgress.processed.toLocaleString()} / {(jobProgress.total ?? 0).toLocaleString()}
        </div>
      )}

      {mounted && !filterAll && selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-gray-50 border border-gray-200">
          <span className="text-sm text-gray-700">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => setShowBulkEdit(true)}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-md border border-brand-700 text-brand-700 text-xs font-medium hover:bg-brand-700/5 disabled:opacity-50"
          >
            Edit {selectedIds.size}
          </button>
          <MoveToMenu
            currentSegment={segment}
            disabled={busy !== null}
            count={selectedIds.size}
            onMove={(target) => handleMove(target)}
          />
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-md border border-red-300 text-red-700 text-xs font-medium hover:bg-red-50 disabled:opacity-50"
          >
            Delete {selectedIds.size}
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 rounded-md text-gray-600 text-xs hover:text-gray-900"
          >
            Clear
          </button>
        </div>
      )}

      {busy && typeof busy === 'string' && busy.startsWith('Verifying') && (
        <div className="text-sm text-gray-600 italic">{busy}</div>
      )}
      {toast && (
        <div className="px-4 py-3 rounded-md bg-blue-50 border border-blue-200 text-sm text-blue-900">
          {toast}
        </div>
      )}
      {error && (
        <div className="px-4 py-3 rounded-md bg-red-50 border border-red-200 text-sm text-red-900">
          {error}
        </div>
      )}

      {/* Top pagination — same controls as the bottom pager, mirrored
          here so changing page/size doesn't require scrolling past every
          row. Both <Pager> instances share the same state so they stay
          in sync. */}
      <Pager
        currentPage={Math.floor(offset / pageSize) + 1}
        totalItems={total}
        pageSize={pageSize}
        disabled={loading}
        onPageChange={(p) => setOffset((p - 1) * pageSize)}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={(n) => { setPageSize(n); setOffset(0); }}
        summary={total > 0 ? `Showing ${offset + 1}–${Math.min(offset + rows.length, total)} of ${total.toLocaleString()}` : ''}
      />

      {/* Table */}
      {/* Mobile card list — mirrors the desktop table above, respecting column
          visibility. Rendered <sm only. */}
      <div className="sm:hidden rounded-md border border-gray-200 bg-white divide-y divide-gray-100">
        <div className="px-3 py-2 flex items-center gap-2 text-xs text-gray-600 border-b border-gray-200 bg-gray-50">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={(e) => handleSelectAll(e.target.checked)}
            aria-label="Select all rows"
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span>Select all ({selectedIds.size} of {rows.length})</span>
        </div>
        {loading && (
          <div className="px-3 py-8 text-center text-sm text-gray-500">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-3 py-8 text-center text-sm text-gray-500">No contacts yet.</div>
        )}
        {!loading && rows.map((r) => {
          const hasAddr = !!(r.address || r.city || r.state || r.zip);
          const fullName = toTitleCaseName([r.first_name, r.last_name].filter(Boolean).join(' '));
          return (
            <div
              key={r.id}
              className="px-3 py-3 flex items-start gap-3 hover:bg-gray-50 cursor-pointer"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest('input,button,a')) return;
                setEditing(r);
              }}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(r.id)}
                onChange={(e) => handleSelect(r.id, e.target.checked)}
                aria-label={`Select ${fullName || r.email || r.id}`}
                className="mt-1 h-4 w-4 flex-shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                {isVisible('name') && (
                  <div>
                    <div className="text-sm font-medium text-gray-900 break-words">{fullName || '—'}</div>
                    {r.title && <div className="text-[11px] text-gray-500">{toTitleCaseRole(r.title)}</div>}
                  </div>
                )}
                {isVisible('email') && r.email && (
                  <div className="text-sm">
                    <a
                      href={`mailto:${r.email}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-600 hover:underline break-words"
                    >{r.email}</a>
                  </div>
                )}
                {isVisible('tag') && (
                  <div><TagChips tags={r.tags} /></div>
                )}
                {(isVisible('company') || isVisible('city') || isVisible('phone')) && (
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    {isVisible('company') && r.company && (
                      <>
                        <dt className="text-gray-500 uppercase tracking-wider">Company</dt>
                        <dd className="text-gray-800 text-right break-words">{r.company}</dd>
                      </>
                    )}
                    {isVisible('city') && r.city && (
                      <>
                        <dt className="text-gray-500 uppercase tracking-wider">City</dt>
                        <dd className="text-gray-800 text-right break-words">{r.city}</dd>
                      </>
                    )}
                    {isVisible('phone') && (r.phone || r.mobile_phone) && (
                      <>
                        <dt className="text-gray-500 uppercase tracking-wider">Phone</dt>
                        <dd className="text-gray-800 text-right">
                          {formatPhone(r.phone)}
                          {r.mobile_phone && <div className="text-[10px] text-gray-500">m: {r.mobile_phone}</div>}
                        </dd>
                      </>
                    )}
                  </dl>
                )}
                {isVisible('proximity') && (
                  <div><ProximityBadges row={r} segment={segment} /></div>
                )}
                {(isVisible('address') || isVisible('email_verify')) && (
                  <div className="pt-1 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {isVisible('address') && (
                      <VerifyCell
                        status={r.addr_status}
                        hasData={hasAddr}
                        busy={busy === `addr-${r.id}`}
                        onVerify={() => verifyAddress(r.id)}
                        label="USPS"
                      />
                    )}
                    {isVisible('email_verify') && (
                      <div className="flex flex-col gap-1">
                        <VerifyCell
                          status={r.email_status}
                          hasData={!!r.email}
                          busy={busy === `email-${r.id}`}
                          onVerify={() => verifyEmail(r.id)}
                          label="SMTP"
                        />
                        <EmailFlags row={r} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-600 uppercase tracking-wider">
            <tr>
              <th className="px-3 py-3 text-left w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={(e) => handleSelectAll(e.target.checked)}
                />
              </th>
              {isVisible('name')  && <SortHeader col="first_name" label="Name"    sort={sort} dir={dir} onSort={handleSort} />}
              {isVisible('tag')   && <th className="px-3 py-3 text-left font-semibold">Tag</th>}
              {isVisible('email') && <SortHeader col="email"      label="Email"   sort={sort} dir={dir} onSort={handleSort} />}
              {isVisible('phone') && <th className="px-3 py-3 text-left font-semibold">Phone</th>}
              {isVisible('company') && <SortHeader col="company" label="Company" sort={sort} dir={dir} onSort={handleSort} />}
              {isVisible('city')    && <SortHeader col="city"    label="City"    sort={sort} dir={dir} onSort={handleSort} />}
              {isVisible('proximity')    && <th className="px-3 py-3 text-left font-semibold">Proximity</th>}
              {isVisible('address')      && <th className="px-3 py-3 text-left font-semibold">Address</th>}
              {/* BUG-33: was "Email" (duplicate header with the Email column above).
                  Match the column-picker label so the SMTP verify column is
                  visually distinct from the raw email column. */}
              {isVisible('email_verify') && <th className="px-3 py-3 text-left font-semibold">Email (SMTP)</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={1 + COLUMNS.filter((c) => visibleCols[c.id]).length} className="px-3 py-8 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={1 + COLUMNS.filter((c) => visibleCols[c.id]).length} className="px-3 py-8 text-center text-gray-500">
                No contacts yet.
              </td></tr>
            )}
            {!loading && rows.map((r) => {
              const hasAddr = !!(r.address || r.city || r.state || r.zip);
              const fullName = toTitleCaseName([r.first_name, r.last_name].filter(Boolean).join(' '));
              return (
                <tr
                  key={r.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setEditing(r)}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={(e) => handleSelect(r.id, e.target.checked)}
                    />
                  </td>
                  {isVisible('name') && (
                    <td className="px-3 py-2">
                      <div className="text-gray-900 font-medium">{fullName || '—'}</div>
                      {r.title && <div className="text-[11px] text-gray-500">{toTitleCaseRole(r.title)}</div>}
                    </td>
                  )}
                  {isVisible('tag') && (
                    <td className="px-3 py-2">
                      <TagChips tags={r.tags} />
                    </td>
                  )}
                  {isVisible('email') && (
                    <td className="px-3 py-2 text-gray-700">
                      {r.email ? (
                        <a
                          href={`mailto:${r.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {r.email}
                        </a>
                      ) : ''}
                    </td>
                  )}
                  {isVisible('phone') && (
                    <td className="px-3 py-2 text-gray-700 text-xs">
                      {formatPhone(r.phone)}
                      {r.mobile_phone && <div className="text-[10px] text-gray-500">m: {r.mobile_phone}</div>}
                    </td>
                  )}
                  {isVisible('company') && (
                    <td className="px-3 py-2 text-gray-700">{r.company ?? ''}</td>
                  )}
                  {isVisible('city') && (
                    <td className="px-3 py-2 text-gray-700">{r.city ?? ''}</td>
                  )}
                  {isVisible('proximity') && (
                    <td className="px-3 py-2">
                      <ProximityBadges row={r} segment={segment} />
                    </td>
                  )}
                  {isVisible('address') && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <VerifyCell
                        status={r.addr_status}
                        hasData={hasAddr}
                        busy={busy === `addr-${r.id}`}
                        onVerify={() => verifyAddress(r.id)}
                        label="USPS"
                      />
                    </td>
                  )}
                  {isVisible('email_verify') && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1">
                        <VerifyCell
                          status={r.email_status}
                          hasData={!!r.email}
                          busy={busy === `email-${r.id}`}
                          onVerify={() => verifyEmail(r.id)}
                          label="SMTP"
                        />
                        <EmailFlags row={r} />
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <Pager
        currentPage={Math.floor(offset / pageSize) + 1}
        totalItems={total}
        pageSize={pageSize}
        disabled={loading}
        onPageChange={(p) => setOffset((p - 1) * pageSize)}
        pageSizeOptions={PAGE_SIZE_OPTIONS}
        onPageSizeChange={(n) => { setPageSize(n); setOffset(0); }}
        summary={total > 0 ? `Showing ${offset + 1}–${Math.min(offset + rows.length, total)} of ${total.toLocaleString()}` : ''}
      />

      {/* Edit drawer */}
      {editing && (
        <EditDrawer
          row={editing}
          segment={segment}
          onClose={() => setEditing(null)}
          onSaved={(row) => { mergeRow(row); showToast('Saved.'); }}
          onVerifyAddress={() => verifyAddress(editing.id)}
          onVerifyEmail={() => verifyEmail(editing.id)}
          busy={busy}
        />
      )}

      {showAdd && <AddDialog segment={segment} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); void reload(); }} />}
      {showImport && <ImportDialog segment={segment} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); void reload(); }} />}
      {showBulkEdit && (
        <BulkEditDialog
          ids={Array.from(selectedIds)}
          onClose={() => setShowBulkEdit(false)}
          onDone={(updated) => {
            setShowBulkEdit(false);
            setSelectedIds(new Set());
            showToast(`Updated ${updated} contact${updated === 1 ? '' : 's'}.`);
            void reload();
          }}
        />
      )}
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================

function MoveToMenu({
  currentSegment, count, disabled, onMove,
}: {
  currentSegment: MailingSegment;
  count: number;
  disabled: boolean;
  onMove: (target: MailingSegment) => void;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest('[data-move-to-menu]')) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const targets = SEGMENTS.filter((s) => s.segment !== currentSegment);

  return (
    <div className="relative" data-move-to-menu>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="px-3 py-1.5 rounded-md border border-brand-700 text-brand-700 text-xs font-medium hover:bg-brand-700/5 disabled:opacity-50 inline-flex items-center gap-1"
      >
        Move {count} to
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 min-w-[260px] rounded-md border border-gray-200 bg-white shadow-lg py-1"
          role="menu"
        >
          {targets.map((s) => (
            <button
              key={s.segment}
              type="button"
              onClick={() => { setOpen(false); onMove(s.segment); }}
              className="w-full text-left px-3 py-2 text-xs text-gray-800 hover:bg-gray-50"
              role="menuitem"
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: s.accent }}
                  aria-hidden
                />
                <span className="font-medium text-gray-900">{s.label}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KpiCard({
  label, value, sub, accent, action,
}: {
  label:  string;
  value:  number;
  sub:    string;
  accent?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className={`relative rounded-md border border-gray-200 bg-white p-4 ${action ? 'transition-shadow hover:shadow-md' : ''}`}>
      <div className="h-7 w-7 rounded-md mb-3" style={{ backgroundColor: accent ? `${accent}15` : '#f3f4f6' }} />
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="mt-1">
        <div className="text-xs font-semibold text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500">{sub}</div>
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          title={action.label}
          aria-label={action.label}
          className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium text-white shadow-sm hover:opacity-90"
          style={{ backgroundColor: accent ?? '#301D5D' }}
        >
          {/* Download glyph (inline SVG, no icon lib dep) */}
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>CSV</span>
        </button>
      )}
    </div>
  );
}

// TagChips renders the human-meaningful tags on a mailing row in the merged
// realtyline-atx-print segment. We strip provenance ('_was:*') tags, the
// historical 'staff' marker, and the legacy 'advertiser' wrapper tag so the
// admin only sees the audience tags ('active-advertiser', 'non-advertiser').
function TagChips({ tags }: { tags: string[] | null | undefined }) {
  if (!Array.isArray(tags) || tags.length === 0) return <span className="text-xs text-gray-400">—</span>;
  const visible = tags.filter((t) => !t.startsWith('_was:') && t !== 'staff' && t !== 'advertiser');
  if (visible.length === 0) return <span className="text-xs text-gray-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {visible.map((t) => {
        let label = t;
        let bg = '#e5e7eb';
        let fg = '#374151';
        if (t === 'active-advertiser') {
          label = 'Active Advertiser';
          bg = '#ffedd5';
          fg = '#c2410c';
        } else if (t === 'non-advertiser') {
          label = 'Non-Advertiser';
          bg = '#fed7aa';
          fg = '#9a3412';
        } else if (t === 'manual') {
          label = 'Manual';
          bg = '#ede9fe';
          fg = '#301D5D';
        } else if (t === 'REALTOR') {
          label = 'REALTOR';
          bg = '#dcfce7';
          fg = '#16a34a';
        } else if (t === 'Loan Officer') {
          label = 'Loan Officer';
          bg = '#fef3c7';
          fg = '#d97706';
        } else if (t === 'Business Development') {
          label = 'Business Development';
          bg = '#e2e8f0';
          fg = '#475569';
        }
        return (
          <span
            key={t}
            className="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
            style={{ backgroundColor: bg, color: fg }}
          >
            {label}
          </span>
        );
      })}
    </div>
  );
}

function FilterChip({
  active, onClick, label, count, accent,
}: { active: boolean; onClick: () => void; label: string; count: number; accent?: string }) {
  const bg = active ? (accent ?? '#301D5D') : '#f3f4f6';
  const fg = active ? 'white' : '#374151';
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2"
      style={{ backgroundColor: bg, color: fg }}
    >
      <span>{label}</span>
      <span
        className="px-1.5 rounded-full text-[10px]"
        style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'white', color: active ? 'white' : '#6b7280' }}
      >
        {count.toLocaleString()}
      </span>
    </button>
  );
}

function SortHeader({
  col, label, sort, dir, onSort,
}: {
  col: MailingColumnId; label: string;
  sort: MailingColumnId; dir: 'asc' | 'desc';
  onSort: (col: MailingColumnId) => void;
}) {
  const active = sort === col;
  return (
    <th
      className="px-3 py-3 text-left font-semibold cursor-pointer select-none hover:text-gray-900"
      onClick={() => onSort(col)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span>{dir === 'asc' ? '↑' : '↓'}</span>}
      </span>
    </th>
  );
}

function VerifyCell({
  status, hasData, busy, onVerify, label,
}: {
  status: VerifyStatus | null;
  hasData: boolean;
  busy: boolean;
  onVerify: () => void;
  label: string;
}) {
  if (!hasData) return <span className="text-xs text-gray-400">—</span>;
  const pill =
    status === 'Valid'   ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-green-100 text-green-800">✓ Valid</span> :
    status === 'Invalid' ? <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-800">✗ Invalid</span> :
                           <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">Pending</span>;
  return (
    <div className="flex items-center gap-1.5">
      {pill}
      <button
        type="button"
        disabled={busy}
        onClick={onVerify}
        className="text-[11px] px-2 py-0.5 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        title={`Run ${label} verification`}
      >
        {busy ? '…' : `Verify ${label}`}
      </button>
    </div>
  );
}

function EmailFlags({ row }: { row: MailingContactRow }) {
  const flags: { label: string; cls: string; title: string }[] = [];
  if (row.email_disposable) {
    flags.push({
      label: 'Disposable',
      cls:   'bg-red-100 text-red-800 ring-1 ring-red-200',
      title: 'Throwaway / temporary email provider',
    });
  }
  if (row.email_catch_all) {
    flags.push({
      label: 'Catch-all',
      cls:   'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
      title: 'Domain accepts any mailbox — existence cannot be proven',
    });
  }
  if (row.email_free_provider) {
    flags.push({
      label: 'Free mail',
      cls:   'bg-gray-100 text-gray-700 ring-1 ring-gray-200',
      title: 'Gmail/Outlook/Yahoo — SMTP probe blocked, address looks well-formed',
    });
  }
  if (row.email_role) {
    flags.push({
      label: 'Role',
      cls:   'bg-indigo-100 text-indigo-800 ring-1 ring-indigo-200',
      title: 'Role / generic mailbox (info@, admin@, support@…)',
    });
  }
  if (row.email_suggestion) {
    flags.push({
      label: `⇒ @${row.email_suggestion}`,
      cls:   'bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200',
      title: `Likely typo — did you mean @${row.email_suggestion}?`,
    });
  }
  // Surface SMTP timeout signal from the persisted email_check JSONB so
  // the user can see at-a-glance which addresses are stuck on slow MX hosts.
  const check = row.email_check as
    | { signals?: {
        smtpTimedOut?: boolean;
        smtpConnected?: boolean;
        mxAttempts?: number;
        managedMailProvider?: 'microsoft365-eop' | 'google-workspace' | 'proofpoint' | null;
      } }
    | null
    | undefined;
  const sig = check?.signals;
  if (sig?.smtpTimedOut && !sig?.smtpConnected) {
    flags.push({
      label: '⏱ Timed out',
      cls:   'bg-orange-100 text-orange-800 ring-1 ring-orange-200',
      title: `Mail server did not respond${sig.mxAttempts ? ` across ${sig.mxAttempts} MX host${sig.mxAttempts === 1 ? '' : 's'}` : ''} — domain may be misconfigured or rate-limiting us`,
    });
  }
  if (sig?.managedMailProvider) {
    const labels: Record<NonNullable<typeof sig.managedMailProvider>, { short: string; long: string }> = {
      'microsoft365-eop': { short: 'M365', long: 'Microsoft 365 (Exchange Online Protection)' },
      'google-workspace': { short: 'Google Workspace', long: 'Google Workspace' },
      'proofpoint':       { short: 'Proofpoint', long: 'Proofpoint' },
    };
    const l = labels[sig.managedMailProvider];
    flags.push({
      label: l.short,
      cls:   'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
      title: `${l.long} — SMTP verification blocked from cloud IPs; needs manual confirmation`,
    });
  }
  if (row.email_notes) {
    // Surface first line of notes as a tooltip-preview so the user
    // sees there's history without opening the drawer.
    const firstLine = row.email_notes.split(/\r?\n/)[0].slice(0, 200);
    flags.push({
      label: '✎ Notes',
      cls:   'bg-purple-100 text-purple-800 ring-1 ring-purple-200',
      title: firstLine || 'Email notes',
    });
  }
  if (flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span
          key={f.label}
          title={f.title}
          className={`inline-flex items-center text-[10px] px-1.5 py-0.5 rounded-full font-medium ${f.cls}`}
        >
          {f.label}
        </span>
      ))}
    </div>
  );
}

function ProximityBadges({
  row,
  segment,
}: {
  row: MailingContactRow;
  segment: MailingSegment;
}) {
  // San Antonio segments anchor on SABOR (9110 IH-10 W, San Antonio).
  // All other mailing-stage segments keep the Austin/Five-Points dual anchor.
  if (isSaborSegment(segment)) {
    const dS = row.distance_sabor_mi;
    if (dS === null || dS === undefined) {
      return <span className="text-[11px] text-gray-400">—</span>;
    }
    const nearS = dS <= NEAR_RADIUS_MI;
    if (!nearS) {
      return (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium ring-1 ring-gray-200"
          title={`${dS.toFixed(1)} mi from SABOR (9110 IH-10 W, San Antonio)`}
        >
          <span>Outside 60 mi</span>
          <span className="text-gray-500">{dS.toFixed(0)} mi · SABOR</span>
        </span>
      );
    }
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium"
        title={`${dS.toFixed(1)} mi from SABOR HQ`}
      >
        <span>Near SABOR</span>
        <span className="text-emerald-700/70">{dS.toFixed(0)} mi</span>
      </span>
    );
  }

  const dA = row.distance_abor_mi;
  const dF = row.distance_fivepoints_mi;
  const hasA = dA !== null && dA !== undefined;
  const hasF = dF !== null && dF !== undefined;
  const nearA = hasA && dA! <= NEAR_RADIUS_MI;
  const nearF = hasF && dF! <= NEAR_RADIUS_MI;
  // Not geocoded at all → neutral em-dash so the column never looks broken.
  if (!hasA && !hasF) {
    return <span className="text-[11px] text-gray-400">—</span>;
  }
  // Geocoded but outside both 60mi radii → dedicated "Outside 60 mi" badge
  // mirroring the new KPI card. We surface the closer of the two distances
  // so the user can tell how far out the contact actually is.
  if (!nearA && !nearF) {
    const closer =
      hasA && hasF ? Math.min(dA!, dF!) :
      hasA         ? dA! :
                     dF!;
    const anchor =
      hasA && hasF ? (dA! <= dF! ? 'ABoR' : 'Five Points') :
      hasA         ? 'ABoR' :
                     'Five Points';
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-700 font-medium ring-1 ring-gray-200"
        title={`${closer.toFixed(1)} mi from nearest anchor (${anchor})`}
      >
        <span>Outside 60 mi</span>
        <span className="text-gray-500">{closer.toFixed(0)} mi · {anchor}</span>
      </span>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      {nearA && (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-medium"
          title={`${dA!.toFixed(1)} mi from ABoR HQ`}
        >
          <span>Near ABoR</span>
          <span className="text-emerald-700/70">{dA!.toFixed(0)} mi</span>
        </span>
      )}
      {nearF && (
        <span
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-800 font-medium"
          title={`${dF!.toFixed(1)} mi from Five Points Board of REALTORS`}
        >
          <span>Near Five Points</span>
          <span className="text-sky-700/70">{dF!.toFixed(0)} mi</span>
        </span>
      )}
    </div>
  );
}

// ============================================================
// Edit drawer
// ============================================================

function EditDrawer({
  row, segment, onClose, onSaved, onVerifyAddress, onVerifyEmail, busy,
}: {
  row: MailingContactRow;
  segment: MailingSegment;
  onClose: () => void;
  onSaved: (row: MailingContactRow) => void;
  onVerifyAddress: () => void;
  onVerifyEmail: () => void;
  busy: string | null;
}) {
  const [form, setForm] = useState({
    first_name:     row.first_name ?? '',
    last_name:      row.last_name ?? '',
    title:          row.title ?? '',
    email:          row.email ?? '',
    company:        row.company ?? '',
    address:        row.address ?? '',
    address_2:      row.address_2 ?? '',
    city:           row.city ?? '',
    state:          row.state ?? '',
    zip:            row.zip ?? '',
    license_number: row.license_number ?? '',
    phone:          formatPhone(row.phone),
    mobile_phone:   formatPhone(row.mobile_phone),
    email_notes:    row.email_notes ?? '',
  });
  // Tags are managed separately from `form` because they're an array, not
  // a string. The editor keeps the canonical tag order from the DB and
  // dedupes on add. Internal `_was:` provenance markers are preserved
  // round-trip but rendered read-only.
  const [tags, setTags] = useState<string[]>(Array.isArray(row.tags) ? row.tags : []);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // When the row prop changes (e.g. after a verify call merges new fields
  // back), refresh the form values. Simplest reliable behavior: replace
  // whole form.
  useEffect(() => {
    queueMicrotask(() => {
      setForm({
        first_name:     row.first_name ?? '',
        last_name:      row.last_name ?? '',
        title:          row.title ?? '',
        email:          row.email ?? '',
        company:        row.company ?? '',
        address:        row.address ?? '',
        address_2:      row.address_2 ?? '',
        city:           row.city ?? '',
        state:          row.state ?? '',
        zip:            row.zip ?? '',
        license_number: row.license_number ?? '',
        phone:          formatPhone(row.phone),
        mobile_phone:   formatPhone(row.mobile_phone),
        email_notes:    row.email_notes ?? '',
      });
      setTags(Array.isArray(row.tags) ? row.tags : []);
    });
  }, [row.id, row.updated_at, row.first_name, row.last_name, row.title,
      row.email, row.company, row.address, row.address_2, row.city,
      row.state, row.zip, row.license_number, row.phone, row.mobile_phone,
      row.email_notes, row.tags]);

  const setField = (k: keyof typeof form, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/mailing/${row.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tags }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      if (j.row) onSaved(j.row);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const fullName = [form.first_name, form.last_name].filter(Boolean).join(' ') || 'Contact';
  const addrBusy = busy === `addr-${row.id}`;
  const emailBusy = busy === `email-${row.id}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-medium">
              Contact
            </p>
            <h2 className="font-serif text-xl text-gray-900">{fullName}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {/* Verify summary */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Address Verification
              </div>
              <div className="text-sm">
                {row.addr_status === 'Valid' && (
                  <span className="text-green-700 font-medium">✓ Valid (USPS)</span>
                )}
                {row.addr_status === 'Invalid' && (
                  <span className="text-red-700 font-medium">✗ Invalid</span>
                )}
                {(!row.addr_status || row.addr_status === 'Pending') && (
                  <span className="text-gray-600">Pending</span>
                )}
              </div>
              {row.addr_usps_normalized && (
                <div className="text-[11px] text-gray-500 leading-tight">
                  USPS: {row.addr_usps_normalized}
                </div>
              )}
              {isSaborSegment(segment)
                ? (row.distance_sabor_mi !== null && row.distance_sabor_mi !== undefined && (
                    <div className="text-[11px] text-gray-500">
                      {row.distance_sabor_mi.toFixed(1)} mi to SABOR
                    </div>
                  ))
                : (row.distance_abor_mi !== null && row.distance_abor_mi !== undefined && (
                    <div className="text-[11px] text-gray-500">
                      {row.distance_abor_mi.toFixed(1)} mi to ABoR
                      {row.distance_fivepoints_mi !== null && row.distance_fivepoints_mi !== undefined &&
                        ` · ${row.distance_fivepoints_mi.toFixed(1)} mi to Five Points`}
                    </div>
                  ))}
              <button
                type="button"
                disabled={addrBusy}
                onClick={onVerifyAddress}
                className="text-xs px-2.5 py-1 rounded-md bg-brand-700 text-white hover:bg-[#5a0e5f] disabled:opacity-50"
              >
                {addrBusy ? 'Verifying…' : 'Verify with USPS'}
              </button>
            </div>

            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 space-y-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                Email Verification
              </div>
              <div className="text-sm">
                {row.email_status === 'Valid' && (
                  <span className="text-green-700 font-medium">✓ Valid (SMTP)</span>
                )}
                {row.email_status === 'Invalid' && (
                  <span className="text-red-700 font-medium">✗ Invalid</span>
                )}
                {(!row.email_status || row.email_status === 'Pending') && (
                  <span className="text-gray-600">Pending</span>
                )}
              </div>
              <div className="text-[11px] text-gray-500 leading-tight break-all">
                {row.email ?? <span className="italic">no email</span>}
              </div>
              <button
                type="button"
                disabled={emailBusy || !form.email}
                onClick={onVerifyEmail}
                className="text-xs px-2.5 py-1 rounded-md bg-brand-700 text-white hover:bg-[#5a0e5f] disabled:opacity-50"
              >
                {emailBusy ? 'Verifying…' : 'Verify Email'}
              </button>
            </div>
          </div>

          {/* Editable form */}
          <div className="grid grid-cols-2 gap-3">
            <DrawerField label="First Name"   value={form.first_name}     onChange={(v) => setField('first_name', v)} />
            <DrawerField label="Last Name"    value={form.last_name}      onChange={(v) => setField('last_name', v)} />
            <DrawerField label="Title"        value={form.title}          onChange={(v) => setField('title', v)} className="col-span-2" />
            <DrawerField label="Email"        value={form.email}          onChange={(v) => setField('email', v)} className="col-span-2" type="email" />
            <DrawerField label="Company"      value={form.company}        onChange={(v) => setField('company', v)} className="col-span-2" />
            <DrawerField label="Mailing Address"   value={form.address}   onChange={(v) => setField('address', v)} className="col-span-2" />
            <DrawerField label="Mailing Address 2" value={form.address_2} onChange={(v) => setField('address_2', v)} className="col-span-2" />
            <DrawerField label="City"         value={form.city}           onChange={(v) => setField('city', v)} />
            <DrawerField label="State"        value={form.state}          onChange={(v) => setField('state', v)} />
            <DrawerField label="ZIP Code"     value={form.zip}            onChange={(v) => setField('zip', v)} />
            <DrawerField label="TREC License" value={form.license_number} onChange={(v) => setField('license_number', v)} />
            <DrawerField label="Phone"        value={form.phone}          onChange={(v) => setField('phone', formatPhoneInput(v))} type="tel" placeholder="(000) 000-0000" />
            <DrawerField label="Mobile / Cell" value={form.mobile_phone}  onChange={(v) => setField('mobile_phone', v)} type="tel" />
          </div>

          {/* Tags editor — add from the library catalog or type a custom
              tag. Removing a tag here only affects this contact; use the
              global Tag Library (/admin/mailing/tags) to rename or delete
              tags everywhere. */}
          <div>
            <span className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Tags
            </span>
            <TagsEditor tags={tags} onChange={setTags} />
          </div>

          {/* Email notes — free-text journal for verifier outcomes,
              bounce reports, manual confirmations, etc. Each verify
              run auto-appends a timestamped line; the user can also
              edit freely. */}
          <div>
            <label className="block">
              <span className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
                Email Notes
              </span>
              <textarea
                value={form.email_notes}
                onChange={(e) => setField('email_notes', e.target.value)}
                rows={5}
                placeholder="Notes about this contact&apos;s email — e.g. bounced 5/30, verified via phone, alternate address..."
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-700 resize-y"
              />
              <span className="mt-1 block text-[10px] text-gray-500">
                Each verifier run auto-appends a timestamped line. Edit freely.
              </span>
            </label>
          </div>

          {saveError && (
            <div className="px-3 py-2 rounded-md bg-red-50 border border-red-200 text-xs text-red-900">
              {saveError}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="px-4 py-2 rounded-md text-sm font-medium text-white bg-brand-700 hover:bg-[#5a0e5f] disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Tags editor — chips with remove + typeahead-add
//
// Pulls the global tag catalog from /api/admin/mailing/tags once per mount
// so the suggestion list is always live. Adding an unknown tag is allowed:
// it just becomes a new tag in the library on save.

const TAG_STYLES: Record<string, { bg: string; fg: string; label?: string }> = {
  'active-advertiser':    { bg: '#ffedd5', fg: '#c2410c', label: 'Active Advertiser' },
  'non-advertiser':       { bg: '#fed7aa', fg: '#9a3412', label: 'Non-Advertiser' },
  'manual':               { bg: '#ede9fe', fg: '#301D5D', label: 'Manual' },
  'REALTOR':              { bg: '#dcfce7', fg: '#16a34a' },
  'Loan Officer':         { bg: '#fef3c7', fg: '#d97706' },
  'Business Development': { bg: '#e2e8f0', fg: '#475569' },
};

function tagStyle(tag: string) {
  return TAG_STYLES[tag] ?? { bg: '#f3f4f6', fg: '#374151' };
}

function TagsEditor({
  tags, onChange,
}: {
  tags: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState('');
  const [library, setLibrary] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/mailing/tags', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : { tags: [] }))
      .then((j: { tags?: { tag: string }[] }) => {
        if (cancelled) return;
        const all = (j.tags ?? []).map((t) => t.tag).filter((t) => !t.startsWith('_was:'));
        setLibrary(all);
      })
      .catch(() => { /* non-fatal — fall back to typing custom tags */ });
    return () => { cancelled = true; };
  }, []);

  // Always prepend the canonical library tags so users see the brand
  // categories first even if no one has used them yet.
  const CORE = ['REALTOR', 'Loan Officer', 'Business Development'];
  const catalog = useMemo(() => {
    const set = new Set<string>([...CORE, ...library]);
    return Array.from(set);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [library]);

  const suggestions = useMemo(() => {
    const q = input.trim().toLowerCase();
    return catalog
      .filter((t) => !tags.includes(t))
      .filter((t) => (q ? t.toLowerCase().includes(q) : true))
      .slice(0, 8);
  }, [catalog, input, tags]);

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (tags.includes(t)) { setInput(''); return; }
    onChange([...tags, t]);
    setInput('');
  };

  const removeTag = (t: string) => {
    onChange(tags.filter((x) => x !== t));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[2rem] rounded-md border border-gray-300 px-2 py-1.5 bg-white">
        {tags.length === 0 && (
          <span className="text-xs text-gray-400 self-center">No tags yet — start typing below.</span>
        )}
        {tags.map((t) => {
          const s = tagStyle(t);
          const isProvenance = t.startsWith('_was:');
          return (
            <span
              key={t}
              className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium"
              style={{
                background: isProvenance ? '#f3f4f6' : s.bg,
                color: isProvenance ? '#6b7280' : s.fg,
              }}
            >
              {s.label || t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                className="ml-0.5 rounded-full hover:bg-black/10 px-1 text-[10px] leading-none"
                aria-label={`Remove ${t}`}
                title={`Remove ${t}`}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      <div className="relative">
        <input
          type="text"
          value={input}
          onChange={(e) => { setInput(e.target.value); setShowSuggest(true); }}
          onFocus={() => setShowSuggest(true)}
          onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); addTag(input); }
            if (e.key === ',')     { e.preventDefault(); addTag(input); }
            if (e.key === 'Backspace' && !input && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          placeholder="Add a tag — pick a suggestion or type a new one and press Enter"
          className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
        />
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-56 overflow-y-auto">
            {suggestions.map((t) => {
              const s = tagStyle(t);
              return (
                <button
                  type="button"
                  key={t}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => addTag(t)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
                >
                  <span
                    className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
                    style={{ background: s.bg, color: s.fg }}
                  >
                    {s.label || t}
                  </span>
                  <span className="text-[10px] text-gray-400">add</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <p className="text-[10px] text-gray-500">
        Press Enter or comma to add. Click × to remove. New tags are saved to the library on save.
      </p>
    </div>
  );
}

function DrawerField({
  label, value, onChange, className, type, placeholder, inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  type?: string;
  placeholder?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="block text-[11px] uppercase tracking-wider text-gray-500 font-semibold mb-1">
        {label}
      </span>
      <input
        type={type ?? 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700"
      />
    </label>
  );
}

// ──────────────────────────────────────────────────────────────
// Add-contact dialog

function AddDialog({
  segment, onClose, onSaved,
}: { segment: MailingSegment; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', company: '', title: '',
    license_number: '', address: '', address_2: '', city: '', state: '', zip: '', website: '', notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    if (!form.first_name.trim() && !form.email.trim()) {
      setErr('First name or email required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch('/api/admin/mailing', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, ...form }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-md max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-xl text-gray-900 mb-4">Add contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="First name *" value={form.first_name}     onChange={(v) => set('first_name', v)} />
          <Field label="Last name"    value={form.last_name}      onChange={(v) => set('last_name', v)} />
          <Field label="Email"        value={form.email}          onChange={(v) => set('email', v)} type="email" />
          <Field label="Phone"        value={form.phone}          onChange={(v) => set('phone', formatPhoneInput(v))} placeholder="(000) 000-0000" />
          <Field label="Company"      value={form.company}        onChange={(v) => set('company', v)} />
          <Field label="Title"        value={form.title}          onChange={(v) => set('title', v)} />
          <Field label="License #"    value={form.license_number} onChange={(v) => set('license_number', v)} />
          <Field label="Website"      value={form.website}        onChange={(v) => set('website', v)} />
          <Field label="Address"      value={form.address}        onChange={(v) => set('address', v)} className="sm:col-span-2" />
          <Field label="Address 2"    value={form.address_2}      onChange={(v) => set('address_2', v)} className="sm:col-span-2" />
          <Field label="City"         value={form.city}           onChange={(v) => set('city', v)} />
          <Field label="State"        value={form.state}          onChange={(v) => set('state', v)} />
          <Field label="ZIP"          value={form.zip}            onChange={(v) => set('zip', v)} />
        </div>
        <label className="block mt-3 text-xs font-medium text-gray-700">Notes</label>
        <textarea
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          rows={3}
          className="w-full mt-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
        {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 whitespace-nowrap">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', className = '', placeholder, inputMode,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; className?: string;
  placeholder?: string;
  inputMode?: React.InputHTMLAttributes<HTMLInputElement>['inputMode'];
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-700 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
      />
    </label>
  );
}

// ──────────────────────────────────────────────────────────────
// Import dialog — CSV / TSV / JSON file → column mapping → insert

function ImportDialog({
  segment, onClose, onDone,
}: { segment: MailingSegment; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<'pick' | 'map' | 'go'>('pick');
  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, CanonicalImportField>>({});
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function processFile(file: File) {
    setFileName(file.name);
    try {
      const lower = file.name.toLowerCase();
      const accepted =
        lower.endsWith('.csv') ||
        lower.endsWith('.tsv') ||
        lower.endsWith('.json') ||
        lower.endsWith('.txt');
      if (!accepted) throw new Error('Unsupported file type. Use .csv, .tsv, .json, or .txt.');
      const text = await file.text();
      let parsedRows: Record<string, string>[] = [];

      if (lower.endsWith('.json')) {
        const data = JSON.parse(text);
        const arr = Array.isArray(data) ? data : Array.isArray(data?.rows) ? data.rows : null;
        if (!arr) throw new Error('JSON must be an array of row objects, or { rows: [...] }.');
        parsedRows = arr.map((r: Record<string, unknown>) => {
          const out: Record<string, string> = {};
          for (const [k, v] of Object.entries(r)) out[k] = v == null ? '' : String(v);
          return out;
        });
      } else {
        const delim = lower.endsWith('.tsv') ? '\t' : ',';
        parsedRows = parseDelimited(text, delim);
      }

      if (parsedRows.length === 0) throw new Error('File has no rows.');
      const hdrs = Object.keys(parsedRows[0]);
      setHeaders(hdrs);
      setRows(parsedRows);
      // Auto-guess mapping
      const guess: Record<string, CanonicalImportField> = {};
      for (const h of hdrs) guess[h] = guessField(h);
      setMapping(guess);
      setStep('map');
      setErr(null);
    } catch (ex) {
      setErr(ex instanceof Error ? ex.message : String(ex));
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    if (!isDragging) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    await processFile(file);
  }

  async function runImport() {
    setRunning(true);
    setErr(null);
    try {
      const mapped = rows.map((r) => {
        const out: Record<string, string> = {};
        for (const [hdr, field] of Object.entries(mapping)) {
          if (field === 'skip') continue;
          const v = (r[hdr] ?? '').trim();
          if (!v) continue;
          if (field === 'full_name') {
            const { first_name, last_name } = splitFullName(v);
            if (!out.first_name && first_name) out.first_name = first_name;
            if (!out.last_name  && last_name)  out.last_name  = last_name;
          } else if (!out[field]) {
            out[field] = v;
          }
        }
        return out;
      });
      const res = await fetch('/api/admin/mailing/import', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segment, rows: mapped }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const j = await res.json() as { inserted: number; skipped: number };
      setResult(j);
      setStep('go');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  const preview = useMemo(() => rows.slice(0, 5), [rows]);

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-md max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-xl text-gray-900 mb-1">Import contacts</h2>
        <p className="text-sm text-gray-600 mb-4">CSV, TSV, or JSON. Headers will be auto-mapped — review and adjust before importing.</p>

        {step === 'pick' && (
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-md p-8 text-center transition ${
              isDragging ? 'border-gray-900 bg-gray-50' : 'border-gray-300'
            }`}
          >
            <p className="text-sm text-gray-700 mb-3">
              {isDragging ? 'Drop file to import\u2026' : 'Drag &amp; drop a file here'}
            </p>
            <p className="text-xs text-gray-500 mb-4">or</p>
            <input
              type="file"
              accept=".csv,.tsv,.json,.txt"
              onChange={handleFile}
              className="block mx-auto text-sm"
            />
            <p className="mt-3 text-xs text-gray-500">CSV, TSV, or JSON. Max ~50,000 rows.</p>
          </div>
        )}

        {step === 'map' && (
          <>
            <p className="text-sm text-gray-700 mb-2"><strong>{rows.length}</strong> rows from <em>{fileName}</em></p>
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-64 overflow-y-auto">
              {headers.map((h) => (
                <div key={h} className="flex items-center gap-3 px-3 py-2 text-sm">
                  <div className="flex-1 font-medium text-gray-800 truncate">{h}</div>
                  <span className="text-gray-400">→</span>
                  <select
                    value={mapping[h]}
                    onChange={(e) => setMapping((m) => ({ ...m, [h]: e.target.value as CanonicalImportField }))}
                    className="text-sm border border-gray-300 rounded-md px-2 py-1"
                  >
                    <option value="skip">— Skip —</option>
                    <option value="full_name">Full Name (auto-split)</option>
                    <option value="first_name">First Name</option>
                    <option value="last_name">Last Name</option>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                    <option value="company">Company</option>
                    <option value="title">Title</option>
                    <option value="license_number">License #</option>
                    <option value="address">Address</option>
                    <option value="address_2">Address 2</option>
                    <option value="city">City</option>
                    <option value="state">State</option>
                    <option value="zip">ZIP</option>
                    <option value="website">Website</option>
                    <option value="notes">Notes</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="text-xs font-semibold text-gray-700 mb-2">Preview (first 5 rows)</div>
              <div className="overflow-x-auto border border-gray-200 rounded-md">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>{headers.map((h) => <th key={h} className="px-2 py-1 text-left text-gray-600 whitespace-nowrap">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {headers.map((h) => <td key={h} className="px-2 py-1 text-gray-800 whitespace-nowrap">{r[h]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {step === 'go' && result && (
          <div className="rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-800">
            Imported <strong>{result.inserted}</strong> contacts. {result.skipped > 0 && <>Skipped {result.skipped} (missing required fields or duplicates within the file).</>}
          </div>
        )}

        {err && <div className="mt-3 text-sm text-red-700">{err}</div>}

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 whitespace-nowrap">
            {step === 'go' ? 'Close' : 'Cancel'}
          </button>
          {step === 'map' && (
            <button onClick={runImport} disabled={running} className="px-4 py-2 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 whitespace-nowrap">
              {running ? 'Importing…' : `Import ${rows.length} rows`}
            </button>
          )}
          {step === 'go' && (
            <button onClick={onDone} className="px-4 py-2 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800 whitespace-nowrap">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// CSV/TSV parser — minimal, header-row required, RFC 4180 quote handling.

function parseDelimited(text: string, delim: string): Record<string, string>[] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { cur.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); cur = []; field = ''; }
        if (ch === '\r' && text[i + 1] === '\n') i += 1;
      } else {
        field += ch;
      }
    }
  }
  if (field !== '' || cur.length > 0) { cur.push(field); rows.push(cur); }
  if (rows.length === 0) return [];
  const headers = rows[0].map((h) => h.trim());
  const out: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length === 1 && row[0] === '') continue;
    const obj: Record<string, string> = {};
    for (let c = 0; c < headers.length; c++) obj[headers[c]] = (row[c] ?? '').trim();
    out.push(obj);
  }
  return out;
}

// ============================================================
// Columns dropdown
// ============================================================

function ColumnsDropdown({
  visible,
  onChange,
}: {
  visible: Record<ColumnId, boolean>;
  onChange: (next: Record<ColumnId, boolean>) => void;
}) {
  const [open, setOpen] = useState(false);
  const visibleCount = COLUMNS.filter((c) => visible[c.id]).length;

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[data-columns-dropdown]')) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onClick);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  function toggle(id: ColumnId) {
    const def = COLUMNS.find((c) => c.id === id);
    if (def?.alwaysOn) return;
    onChange({ ...visible, [id]: !visible[id] });
  }

  function reset() {
    onChange({ ...DEFAULT_VISIBLE });
  }

  return (
    <div className="relative inline-block" data-columns-dropdown>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 flex items-center gap-1"
        title="Show or hide columns"
      >
        Columns
        <span className="text-xs text-gray-500">({visibleCount}/{COLUMNS.length})</span>
        <span aria-hidden className="text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-md shadow-md min-w-[220px] py-1">
          <div className="px-3 py-2 text-[10px] uppercase tracking-[0.18em] text-gray-500 font-semibold">
            Visible columns
          </div>
          {COLUMNS.map((c) => (
            <label
              key={c.id}
              className={`flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer hover:bg-gray-50 ${
                c.alwaysOn ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              <input
                type="checkbox"
                checked={!!visible[c.id]}
                disabled={c.alwaysOn}
                onChange={() => toggle(c.id)}
              />
              <span className="flex-1 text-gray-800">{c.label}</span>
              {c.alwaysOn && <span className="text-[10px] text-gray-400 uppercase">locked</span>}
            </label>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-1 px-2 pb-1">
            <button
              type="button"
              onClick={reset}
              className="w-full text-left px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
            >
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Bulk edit dialog
//
// Applies the same partial update to every selected row. Each field is
// optional — leaving a field blank leaves that field unchanged on every
// row. Use the "Set" toggle to mark which fields the user actually wants
// to write (so you can clear a value by toggling Set and leaving the
// input empty).
// ============================================================

type BulkEditField = 'company' | 'title' | 'city' | 'state' | 'zip' | 'source' | 'notes';

const BULK_EDIT_FIELDS: { id: BulkEditField; label: string; type?: string }[] = [
  { id: 'company', label: 'Company' },
  { id: 'title',   label: 'Title' },
  { id: 'city',    label: 'City' },
  { id: 'state',   label: 'State' },
  { id: 'zip',     label: 'ZIP' },
  { id: 'source',  label: 'Source' },
  { id: 'notes',   label: 'Notes' },
];

function BulkEditDialog({
  ids,
  onClose,
  onDone,
}: {
  ids: string[];
  onClose: () => void;
  onDone: (updated: number) => void;
}) {
  const [enabled, setEnabled] = useState<Record<BulkEditField, boolean>>({
    company: false, title: false, city: false, state: false, zip: false, source: false, notes: false,
  });
  const [values, setValues] = useState<Record<BulkEditField, string>>({
    company: '', title: '', city: '', state: '', zip: '', source: '', notes: '',
  });
  // Tag bulk-edit state. tagsEnabled gates the section; mode picks add /
  // remove / replace; tagList is the working set of chips for the action.
  const [tagsEnabled, setTagsEnabled] = useState(false);
  const [tagsMode, setTagsMode] = useState<'add' | 'remove' | 'replace'>('add');
  const [tagList, setTagList] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const anyFieldEnabled = Object.values(enabled).some(Boolean);
  const anyEnabled = anyFieldEnabled || tagsEnabled;

  async function save() {
    if (!anyEnabled) {
      setErr('Toggle at least one field to apply.');
      return;
    }
    if (tagsEnabled && tagsMode !== 'replace' && tagList.length === 0) {
      setErr(`Add at least one tag to ${tagsMode}.`);
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      let updated = 0;
      // 1) Field patch (company / title / city / ...).
      if (anyFieldEnabled) {
        const patch: Record<string, string> = {};
        for (const f of BULK_EDIT_FIELDS) {
          if (enabled[f.id]) patch[f.id] = values[f.id];
        }
        const res = await fetch('/api/admin/mailing/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'patch', ids, patch }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
        updated = Math.max(updated, Number(j?.updated ?? 0));
      }
      // 2) Tag bulk action (add / remove / replace).
      if (tagsEnabled) {
        const res = await fetch('/api/admin/mailing/bulk', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'tags', ids, mode: tagsMode, tags: tagList }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
        updated = Math.max(updated, Number(j?.updated ?? 0));
      }
      onDone(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center px-4">
      <div className="bg-white rounded-md max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-xl text-gray-900 mb-1">
          Edit {ids.length} contact{ids.length === 1 ? '' : 's'}
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Toggle a field to overwrite it on every selected row. Leave a field
          off to keep the existing value unchanged. Use the Tags section to
          add, remove, or replace tags in bulk.
        </p>
        <div className="space-y-3">
          {BULK_EDIT_FIELDS.filter((f) => f.id !== 'notes').map((f) => (
            <div key={f.id} className="flex items-center gap-2">
              <label className="flex items-center gap-2 w-32 shrink-0 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={enabled[f.id]}
                  onChange={(e) => setEnabled({ ...enabled, [f.id]: e.target.checked })}
                />
                {f.label}
              </label>
              <input
                type="text"
                value={values[f.id]}
                disabled={!enabled[f.id]}
                onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                placeholder={enabled[f.id] ? `New ${f.label.toLowerCase()}…` : '(field off — value unchanged)'}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          ))}
          <div className="flex items-start gap-2">
            <label className="flex items-center gap-2 w-32 shrink-0 text-sm text-gray-700 mt-2">
              <input
                type="checkbox"
                checked={enabled.notes}
                onChange={(e) => setEnabled({ ...enabled, notes: e.target.checked })}
              />
              Notes
            </label>
            <textarea
              value={values.notes}
              disabled={!enabled.notes}
              onChange={(e) => setValues({ ...values, notes: e.target.value })}
              rows={3}
              placeholder={enabled.notes ? 'New notes…' : '(field off — value unchanged)'}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>

          {/* Tags bulk-edit section */}
          <div className="border-t border-gray-200 pt-4 mt-2">
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={tagsEnabled}
                  onChange={(e) => setTagsEnabled(e.target.checked)}
                />
                Tags
              </label>
              {tagsEnabled && (
                <div className="flex items-center gap-1 text-xs">
                  {(['add', 'remove', 'replace'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTagsMode(m)}
                      className={
                        'px-2 py-1 rounded-md border ' +
                        (tagsMode === m
                          ? 'bg-brand-700 text-white border-brand-700'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50')
                      }
                    >
                      {m === 'add' ? 'Add' : m === 'remove' ? 'Remove' : 'Replace'}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tagsEnabled && (
              <>
                <p className="text-[11px] text-gray-500 mb-2">
                  {tagsMode === 'add' && `Add these tags to all ${ids.length} selected contacts (existing tags are kept).`}
                  {tagsMode === 'remove' && `Strip these tags from all ${ids.length} selected contacts.`}
                  {tagsMode === 'replace' && `Replace the tag list on all ${ids.length} selected contacts with exactly the tags below (empty = clear all tags).`}
                </p>
                <TagsEditor tags={tagList} onChange={setTagList} />
              </>
            )}
          </div>
        </div>
        {err && <div className="mt-3 text-sm text-red-700">{err}</div>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50 whitespace-nowrap"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || !anyEnabled}
            className="px-4 py-2 text-sm rounded-md bg-brand-700 text-white hover:bg-[#5a0e5f] disabled:opacity-50 whitespace-nowrap"
          >
            {saving ? 'Applying…' : `Apply to ${ids.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
