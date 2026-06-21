'use client';

// app/admin/mailing/holding/HoldingClient.tsx
//
// Client UI for ABOR Members (holding-stage mailing rows).
//   - Search + filter chips (all / verified / pending)
//   - Sortable columns
//   - Row click → side drawer with every editable field
//   - Real verify buttons:
//       Address → USPS Address API v3   → persists Valid/Invalid + normalized
//                                           string + geocode + distances
//       Email   → MX + SMTP RCPT TO probe → persists Valid/Invalid (Pending
//                                           soft failures keep status alone)
//   - "Near ABoR" / "Near Five Points" badges when the geocoded distance
//     is ≤ 60 mi to the respective REALTOR board HQ.
//   - Bulk select → Promote / Reject
//   - "Sync from UnlockMLS" button

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MailingColumnId,
  MailingContactRow,
  VerifyStatus,
} from '@/lib/mailing';
import { formatPhone, formatPhoneInput } from '@/lib/format-phone';
import { toTitleCaseName, toTitleCaseRole } from '@/lib/format-name';

import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';
import ExportMenu from '@/components/admin/ExportMenu';
import { Pager } from '@/app/admin/_components/Pager'  // imports below extended;
import { PAGE_SIZE_OPTIONS } from '@/app/admin/_components/Pager';
type Counts = { total: number; verified: number; pending: number; near: number; far: number };
type FilterKey = 'all' | 'verified' | 'pending';

const DEFAULT_PAGE_SIZE = 100;
const NEAR_RADIUS_MI = 60;
const SORTABLE: MailingColumnId[] = [
  'first_name', 'last_name', 'email', 'company', 'city', 'state', 'created_at',
];

export default function HoldingClient() {
  const [rows, setRows] = useState<MailingContactRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [filter, setFilter] = useState<FilterKey>('all');
  // ABOR page is scoped to UnlockMLS rows only. SABOR has its own page.
  const source = 'unlockmls';
  const [sort, setSort] = useState<MailingColumnId>('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState<number>(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<MailingContactRow | null>(null);

  // verify-all-pending drain state. `drainJob` is non-null while the
  // client-driven loop is running and is polled every 3s for live counts.
  const [drainJob, setDrainJob] = useState<{
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
        filter,
        sort,
        dir,
        limit: String(pageSize),
        offset: String(offset),
      });
      if (search.trim()) params.set('search', search.trim());
      if (source) params.set('source', source);
      const res = await fetch(`/api/admin/mailing/holding?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as { rows: MailingContactRow[]; total: number; counts: Counts };
      setRows(data.rows);
      setTotal(data.total);
      setCounts(data.counts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [filter, source, sort, dir, offset, search, pageSize]);

  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);

  useEffect(() => {
    const t = setTimeout(() => { queueMicrotask(() => { setOffset(0); }); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { queueMicrotask(() => { setOffset(0); }); }, [filter, source]);

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
      const res = await fetch('/api/admin/mailing/holding/verify-address', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      if (j.row) mergeRow(j.row);
      const verdict = j.verdict ?? 'Unknown';
      const extra = verdict === 'Valid' && j.distance_abor_mi !== null && j.distance_abor_mi !== undefined
        ? ` · ${Number(j.distance_abor_mi).toFixed(1)} mi from ABoR`
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
      const res = await fetch('/api/admin/mailing/holding/verify-email', {
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

  const promote = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Promote ${ids.length} verified contact${ids.length === 1 ? '' : 's'} to the active mailing list?`)) return;
    setBusy('promote');
    try {
      const res = await fetch('/api/admin/mailing/holding/promote', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      const promoted = j.promoted ?? 0;
      const unverified = j.rejected_unverified ?? 0;
      const dup = j.rejected_duplicate ?? 0;
      showToast(
        `Promoted ${promoted}` +
        (unverified ? ` · ${unverified} skipped (unverified)` : '') +
        (dup ? ` · ${dup} skipped (duplicate email)` : ''),
      );
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      showToast(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const reject = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!confirm(`Permanently delete ${ids.length} member${ids.length === 1 ? '' : 's'}?`)) return;
    setBusy('reject');
    try {
      const res = await fetch('/api/admin/mailing/holding/reject', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      showToast(`Rejected ${j.removed ?? 0} member${(j.removed ?? 0) === 1 ? '' : 's'}`);
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      showToast(`Reject failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  // ------------------------------------------------------------------
  // Verify-all-Pending drain: client-driven loop that hits the batch
  // worker repeatedly until the Pending queue is empty. Progress is
  // polled from the verify_jobs row so refreshing the page or running
  // in another tab still picks up the in-flight job.
  // ------------------------------------------------------------------
  const runVerifyDrain = async () => {
    const pendingCount = counts?.pending ?? 0;
    if (pendingCount === 0) {
      showToast('No Pending contacts to verify.');
      return;
    }
    if (!confirm(`Verify all ${pendingCount} Pending contacts? This runs in the background and may take 30+ minutes.`)) {
      return;
    }
    setBusy('drain');
    let jobId: string | null = null;
    let totalForBar = pendingCount;
    try {
      // Step 1: kick off (or join) a drain job.
      const startRes = await fetch('/api/admin/mailing/holding/verify-drain/start', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const startJson = await startRes.json().catch(() => ({}));
      if (startRes.status === 409 && startJson?.job_id) {
        // A drain is already running — join it.
        jobId = startJson.job_id as string;
        totalForBar = startJson.total ?? pendingCount;
        showToast('Joined existing verify-drain job.');
      } else if (!startRes.ok) {
        throw new Error(startJson?.detail || startJson?.error || `HTTP ${startRes.status}`);
      } else {
        jobId = startJson.job_id as string;
        totalForBar = startJson.total ?? pendingCount;
      }
      if (!jobId) throw new Error('start did not return a job_id');
      setDrainJob({
        id:        jobId,
        total:     totalForBar,
        processed: 0,
        valid:     0,
        invalid:   0,
        pending:   0,
        remaining: totalForBar,
        status:    'running',
      });

      // Step 2: drain loop. POST batches sequentially; in parallel, poll status.
      let stopPolling = false;
      const poll = async () => {
        while (!stopPolling) {
          try {
            const sres = await fetch(`/api/admin/mailing/holding/verify-drain/status?id=${jobId}`, {
              credentials: 'include',
            });
            if (sres.ok) {
              const sj = await sres.json();
              const job = sj.job ?? {};
              setDrainJob({
                id:        jobId!,
                total:     job.total ?? totalForBar,
                processed: job.processed ?? 0,
                valid:     job.valid_count ?? 0,
                invalid:   job.invalid_count ?? 0,
                pending:   job.pending_count ?? 0,
                remaining: sj.remaining ?? 0,
                status:    job.status ?? 'running',
              });
            }
          } catch {
            /* ignore poll errors — next tick will retry */
          }
          await new Promise((r) => setTimeout(r, 3000));
        }
      };
      void poll();

      for (;;) {
        const bres = await fetch('/api/admin/mailing/holding/verify-all-pending', {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 150, concurrency: 10, jobId }),
        });
        const bj = await bres.json().catch(() => ({}));
        if (!bres.ok) throw new Error(bj?.detail || bj?.error || `HTTP ${bres.status}`);
        if ((bj.remaining_after ?? 0) === 0 || (bj.processed ?? 0) === 0) {
          break;
        }
      }
      stopPolling = true;
      showToast('Verify drain complete.');
      await reload();
    } catch (err) {
      showToast(`Verify drain failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const syncFromUnlockMLS = async () => {
    if (!confirm('Run the UnlockMLS realtor scraper now? This may take several minutes.')) return;
    setBusy('sync');
    try {
      const res = await fetch('/api/admin/mailing/sync-realtors', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxRecords: 2000 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      showToast(
        `Sync complete: ${j.scraped ?? 0} scraped · ${j.inserted ?? 0} new · ${j.updated ?? 0} updated · ${j.unchanged ?? 0} unchanged`,
      );
      await reload();
    } catch (err) {
      showToast(`Sync failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  // ------------------------------------------------------------------
  // Toolbar actions: Dedupe / Export / Refresh addresses / Delete all
  // (mirrors the segment-page toolbar but scoped to UnlockMLS holding rows).
  // ------------------------------------------------------------------
  const HOLDING_SOURCE = 'unlockmls';
  const AUDIENCE_LABEL = 'ABOR Members';

  const handleDedupe = async () => {
    if (!confirm(`Dedupe ${AUDIENCE_LABEL}? Rows with the same email (or license number, or name+phone) will be merged, keeping the oldest.`)) return;
    setBusy('dedupe');
    try {
      const res = await fetch('/api/admin/mailing/holding/bulk', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dedupe', source: HOLDING_SOURCE }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      showToast(`Removed ${j.removed ?? 0} duplicate(s).`);
      await reload();
    } catch (err) {
      showToast(`Dedupe failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleExport = (format: 'csv' | 'tsv' | 'json') => {
    const url = `/api/admin/mailing/holding/export?source=${encodeURIComponent(HOLDING_SOURCE)}&format=${format}`;
    const a = document.createElement('a');
    a.href = url;
    a.rel = 'noopener';
    a.target = '_self';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleRefreshAddresses = async () => {
    if (!confirm(`Fill in blank address fields in ${AUDIENCE_LABEL} from each matched advertiser? Members are matched by email or license number. Admin edits are preserved.`)) return;
    setBusy('refresh-addr');
    try {
      const res = await fetch('/api/admin/mailing/holding/refresh-addresses', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: HOLDING_SOURCE }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      showToast(
        `Scanned ${j.scanned ?? 0} \u00b7 updated ${j.updated ?? 0} \u00b7 skipped ${j.skippedComplete ?? 0} complete, ${j.skippedNoMatch ?? 0} no match`,
      );
      await reload();
    } catch (err) {
      showToast(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteAll = async () => {
    const inAudience = counts?.total ?? 0;
    if (inAudience === 0) {
      showToast(`No contacts in ${AUDIENCE_LABEL} to delete.`);
      return;
    }
    const first = window.prompt(
      `\u26a0 This will permanently delete ALL ${inAudience.toLocaleString()} contact(s) in ${AUDIENCE_LABEL}. ` +
        `This cannot be undone.\n\nType DELETE to confirm:`,
    );
    if (first !== 'DELETE') return;
    if (!confirm(`Final check: delete all ${inAudience.toLocaleString()} contacts in ${AUDIENCE_LABEL}?`)) return;
    setBusy('delete-all');
    try {
      const res = await fetch('/api/admin/mailing/holding/bulk', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete-all-in-source',
          source: HOLDING_SOURCE,
          confirm: 'DELETE_ALL',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      showToast(`Deleted ${(j.removed ?? 0).toLocaleString()} contact(s) from ${AUDIENCE_LABEL}.`);
      setSelectedIds(new Set());
      await reload();
    } catch (err) {
      showToast(`Delete failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <MailingBreadcrumb trail={[{ label: 'Mailing', href: '/admin/mailing' }, { label: 'ABOR Members' }]} />
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Audience
          </p>
          <PageTitle size="md">ABOR Members</PageTitle>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Austin Board of REALTORS agents scraped from UnlockMLS. Click any
            row to edit details, verify the mailing address through USPS, or
            verify the email. Verified members can be promoted to the active
            mailing list.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={runVerifyDrain}
            className="px-4 py-2 rounded-md border border-[#301D5D] text-[#301D5D] text-sm font-medium hover:bg-[#301D5D] hover:text-white disabled:opacity-50"
            title="Verify every Pending contact in the background (batches of 150)."
          >
            {busy === 'drain' ? 'Verifying…' : 'Verify all Pending'}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={syncFromUnlockMLS}
            className="px-4 py-2 rounded-md bg-[#301D5D] text-white text-sm font-medium hover:bg-[#5a0e5f] disabled:opacity-50"
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync from UnlockMLS'}
          </button>
        </div>
      </div>


      {/* Secondary actions row — Dedupe / Export / Refresh / Delete all */}
      <div className="flex flex-wrap items-center gap-2">
        <ExportMenu disabled={busy !== null} onSelect={handleExport} />
        <button
          type="button"
          onClick={handleDedupe}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === 'dedupe' ? 'Deduping…' : 'Dedupe'}
        </button>
        <button
          type="button"
          onClick={handleRefreshAddresses}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm rounded-md border border-[#301D5D] text-[#301D5D] hover:bg-[#301D5D]/5 disabled:opacity-50"
          title="Fill in blank address fields from each matched advertiser. Matches by email or license number. Admin edits are preserved."
        >
          {busy === 'refresh-addr' ? 'Refreshing…' : 'Refresh addresses from advertisers'}
        </button>
        <button
          type="button"
          onClick={handleDeleteAll}
          disabled={busy !== null}
          className="px-3 py-1.5 text-sm rounded-md border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50"
        >
          {busy === 'delete-all' ? 'Deleting…' : 'Delete all'}
        </button>
      </div>

      {/* Verify-drain progress strip */}
      {drainJob && (
        <div className="rounded-md border border-gray-200 bg-white p-4">
          <div className="flex items-baseline justify-between gap-3 flex-wrap mb-2">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium">
                Verify drain
              </p>
              <p className="font-serif text-lg text-gray-900 mt-0.5">
                {drainJob.processed.toLocaleString()} / {drainJob.total.toLocaleString()} processed
                {drainJob.status !== 'running' && drainJob.status !== 'queued' && (
                  <span className="ml-2 text-xs uppercase tracking-wider text-gray-500">
                    · {drainJob.status}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-gray-600">Valid</span>
                <span className="font-medium text-gray-900">{drainJob.valid.toLocaleString()}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-gray-600">Invalid</span>
                <span className="font-medium text-gray-900">{drainJob.invalid.toLocaleString()}</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500" />
                <span className="text-gray-600">Pending</span>
                <span className="font-medium text-gray-900">{drainJob.pending.toLocaleString()}</span>
              </span>
              <span className="inline-flex items-center gap-1 text-gray-500">
                · {drainJob.remaining.toLocaleString()} remaining
              </span>
            </div>
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full bg-[#301D5D] transition-all"
              style={{
                width: `${drainJob.total > 0 ? Math.min(100, Math.round((drainJob.processed / drainJob.total) * 100)) : 0}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Total members"  value={counts?.total    ?? 0} sub="awaiting review" />
        <KpiCard label="Verified"       value={counts?.verified ?? 0} sub="ready to promote" accent="#3b82f6" />
        <KpiCard label="Pending"        value={counts?.pending  ?? 0} sub="needs verification" accent="#f97316" />
        <KpiCard
          label="Within 60 mi"
          value={counts?.near ?? 0}
          sub="near ABoR or Five Points"
          accent="#2563eb"
          action={(counts?.near ?? 0) > 0 ? {
            label: 'Export CSV',
            onClick: () => {
              // Same-origin GET hits the export endpoint, browser
              // handles the download via Content-Disposition.
              window.location.href = '/api/admin/mailing/holding/export-near';
            },
          } : undefined}
        />
        <KpiCard label="Outside 60 mi"  value={counts?.far      ?? 0} sub="out of both radii" accent="#9ca3af" />
      </div>

      {/* Filter chips + search */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={filter === 'all'}      onClick={() => setFilter('all')}      label="All"      count={counts?.total ?? 0} />
        <FilterChip active={filter === 'verified'} onClick={() => setFilter('verified')} label="Verified" count={counts?.verified ?? 0} accent="#3b82f6" />
        <FilterChip active={filter === 'pending'}  onClick={() => setFilter('pending')}  label="Pending"  count={counts?.pending ?? 0}  accent="#f97316" />

        <div className="flex-1" />

        <input
          type="search"
          placeholder="Search name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-md border border-gray-300 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#301D5D]"
        />
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-md bg-gray-50 border border-gray-200">
          <span className="text-sm text-gray-700">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button
            type="button"
            onClick={promote}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-md bg-green-600 text-white text-xs font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {busy === 'promote' ? 'Promoting…' : 'Promote to Mailing'}
          </button>
          <button
            type="button"
            onClick={reject}
            disabled={busy !== null}
            className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {busy === 'reject' ? 'Rejecting…' : 'Reject'}
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

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
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
              <SortHeader col="first_name" label="Name"    sort={sort} dir={dir} onSort={handleSort} />
              <SortHeader col="email"      label="Email"   sort={sort} dir={dir} onSort={handleSort} />
              <th className="px-3 py-3 text-left font-semibold">Phone</th>
              <SortHeader col="company"    label="Company" sort={sort} dir={dir} onSort={handleSort} />
              <SortHeader col="city"       label="City"    sort={sort} dir={dir} onSort={handleSort} />
              <th className="px-3 py-3 text-left font-semibold">Proximity</th>
              <th className="px-3 py-3 text-left font-semibold">Address</th>
              <th className="px-3 py-3 text-left font-semibold">Email</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-500">
                No members. Try “Sync from UnlockMLS” above.
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
                  <td className="px-3 py-2">
                    <div className="text-gray-900 font-medium">{fullName || '—'}</div>
                    {r.title && <div className="text-[11px] text-gray-500">{toTitleCaseRole(r.title)}</div>}
                  </td>
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
                  <td className="px-3 py-2 text-gray-700 text-xs">
                    {formatPhone(r.phone)}
                    {r.mobile_phone && <div className="text-[10px] text-gray-500">m: {formatPhone(r.mobile_phone)}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.company ?? ''}</td>
                  <td className="px-3 py-2 text-gray-700">{r.city ?? ''}</td>
                  <td className="px-3 py-2">
                    <ProximityBadges row={r} />
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <VerifyCell
                      status={r.addr_status}
                      hasData={hasAddr}
                      busy={busy === `addr-${r.id}`}
                      onVerify={() => verifyAddress(r.id)}
                      label="USPS"
                    />
                  </td>
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
          onClose={() => setEditing(null)}
          onSaved={(row) => { mergeRow(row); showToast('Saved.'); }}
          onVerifyAddress={() => verifyAddress(editing.id)}
          onVerifyEmail={() => verifyEmail(editing.id)}
          busy={busy}
        />
      )}
    </div>
  );
}

// ============================================================
// Subcomponents
// ============================================================

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

function FilterChip({
  active, onClick, label, count, accent,
}: { active: boolean; onClick: () => void; label: string; count: number; accent?: string }) {
  const bg = active ? (accent ?? '#301D5D') : '#f3f4f6';
  const fg = active ? 'white' : '#374151';
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2"
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

function ProximityBadges({ row }: { row: MailingContactRow }) {
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
  row, onClose, onSaved, onVerifyAddress, onVerifyEmail, busy,
}: {
  row: MailingContactRow;
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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // When the row prop changes (e.g. after a verify call merges new fields
  // back), refresh the form values *only* for fields the user hasn't
  // touched. Simplest reliable behavior: replace whole form.
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
    });
  }, [row.id, row.updated_at, row.first_name, row.last_name, row.title,
      row.email, row.company, row.address, row.address_2, row.city,
      row.state, row.zip, row.license_number, row.phone, row.mobile_phone,
      row.email_notes]);

  const setField = (k: keyof typeof form, v: string) => {
    setForm((prev) => ({ ...prev, [k]: v }));
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch('/api/admin/mailing/holding/update', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: row.id, ...form }),
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

  const fullName = [form.first_name, form.last_name].filter(Boolean).join(' ') || 'Member';
  const addrBusy = busy === `addr-${row.id}`;
  const emailBusy = busy === `email-${row.id}`;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-white shadow-xl overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-medium">
              ABOR Member
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
              {row.distance_abor_mi !== null && row.distance_abor_mi !== undefined && (
                <div className="text-[11px] text-gray-500">
                  {row.distance_abor_mi.toFixed(1)} mi to ABoR
                  {row.distance_fivepoints_mi !== null && row.distance_fivepoints_mi !== undefined &&
                    ` · ${row.distance_fivepoints_mi.toFixed(1)} mi to Five Points`}
                </div>
              )}
              <button
                type="button"
                disabled={addrBusy}
                onClick={onVerifyAddress}
                className="text-xs px-2.5 py-1 rounded-md bg-[#301D5D] text-white hover:bg-[#5a0e5f] disabled:opacity-50"
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
                className="text-xs px-2.5 py-1 rounded-md bg-[#301D5D] text-white hover:bg-[#5a0e5f] disabled:opacity-50"
              >
                {emailBusy ? 'Verifying…' : 'Verify Email'}
              </button>
            </div>
          </div>

          {/* Editable form */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="First Name"   value={form.first_name}     onChange={(v) => setField('first_name', v)} />
            <Field label="Last Name"    value={form.last_name}      onChange={(v) => setField('last_name', v)} />
            <Field label="Title"        value={form.title}          onChange={(v) => setField('title', v)} className="col-span-2" />
            <Field label="Email"        value={form.email}          onChange={(v) => setField('email', v)} className="col-span-2" type="email" />
            <Field label="Company"      value={form.company}        onChange={(v) => setField('company', v)} className="col-span-2" />
            <Field label="Mailing Address"   value={form.address}   onChange={(v) => setField('address', v)} className="col-span-2" />
            <Field label="Mailing Address 2" value={form.address_2} onChange={(v) => setField('address_2', v)} className="col-span-2" />
            <Field label="City"         value={form.city}           onChange={(v) => setField('city', v)} />
            <Field label="State"        value={form.state}          onChange={(v) => setField('state', v)} />
            <Field label="ZIP Code"     value={form.zip}            onChange={(v) => setField('zip', v)} />
            <Field label="TREC License" value={form.license_number} onChange={(v) => setField('license_number', v)} />
            <Field label="Phone"        value={form.phone}          onChange={(v) => setField('phone', formatPhoneInput(v))} type="tel" placeholder="(000) 000-0000" />
            <Field label="Mobile / Cell" value={form.mobile_phone} onChange={(v) => setField('mobile_phone', formatPhoneInput(v))} type="tel" placeholder="(000) 000-0000" />
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
                placeholder="Notes about this contact's email — e.g. bounced 5/30, verified via phone, alternate address..."
                className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#301D5D] resize-y"
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
            className="px-4 py-1.5 rounded-md text-sm font-medium text-white bg-[#301D5D] hover:bg-[#5a0e5f] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
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
        className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#301D5D]"
      />
    </label>
  );
}
