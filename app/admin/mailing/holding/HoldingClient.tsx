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

type Counts = { total: number; verified: number; pending: number };
type FilterKey = 'all' | 'verified' | 'pending';

const PAGE_SIZE = 100;
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
  const [sort, setSort] = useState<MailingColumnId>('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState<number>(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [editing, setEditing] = useState<MailingContactRow | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        filter,
        sort,
        dir,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search.trim()) params.set('search', search.trim());
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
  }, [filter, sort, dir, offset, search]);

  useEffect(() => { queueMicrotask(() => { void reload(); }); }, [reload]);

  useEffect(() => {
    const t = setTimeout(() => { queueMicrotask(() => { setOffset(0); }); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { queueMicrotask(() => { setOffset(0); }); }, [filter]);

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
      showToast(`Email: ${j.verdict ?? 'Unknown'}${j.detail ? ` — ${j.detail}` : ''}`);
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

  const allSelected = useMemo(
    () => rows.length > 0 && rows.every((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Audience
          </p>
          <h1 className="font-serif text-3xl text-gray-900">ABOR Members</h1>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Austin Board of REALTORS agents scraped from UnlockMLS. Click any
            row to edit details, verify the mailing address through USPS, or
            verify the email. Verified members can be promoted to the active
            mailing list.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            <Link href="/admin/mailing" className="underline hover:text-gray-700">
              ← Back to Mailing List
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={syncFromUnlockMLS}
            className="px-4 py-2 rounded-md bg-[#3D0740] text-white text-sm font-medium hover:bg-[#5A0E5F] disabled:opacity-50"
          >
            {busy === 'sync' ? 'Syncing…' : 'Sync from UnlockMLS'}
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Total members"  value={counts?.total    ?? 0} sub="awaiting review" />
        <KpiCard label="Verified"       value={counts?.verified ?? 0} sub="ready to promote" accent="#10B981" />
        <KpiCard label="Pending"        value={counts?.pending  ?? 0} sub="needs verification" accent="#F59E0B" />
      </div>

      {/* Filter chips + search */}
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChip active={filter === 'all'}      onClick={() => setFilter('all')}      label="All"      count={counts?.total ?? 0} />
        <FilterChip active={filter === 'verified'} onClick={() => setFilter('verified')} label="Verified" count={counts?.verified ?? 0} accent="#10B981" />
        <FilterChip active={filter === 'pending'}  onClick={() => setFilter('pending')}  label="Pending"  count={counts?.pending ?? 0}  accent="#F59E0B" />

        <div className="flex-1" />

        <input
          type="search"
          placeholder="Search name, email, company…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-2 rounded-md border border-gray-300 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-[#3D0740]"
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
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
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
              const fullName = [r.first_name, r.last_name].filter(Boolean).join(' ');
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
                    {r.title && <div className="text-[11px] text-gray-500">{r.title}</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-700">{r.email ?? ''}</td>
                  <td className="px-3 py-2 text-gray-700 text-xs">
                    {r.phone ?? ''}
                    {r.mobile_phone && <div className="text-[10px] text-gray-500">m: {r.mobile_phone}</div>}
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
                    <VerifyCell
                      status={r.email_status}
                      hasData={!!r.email}
                      busy={busy === `email-${r.id}`}
                      onVerify={() => verifyEmail(r.id)}
                      label="SMTP"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-gray-600">
        <div>
          {total > 0 ? `Showing ${offset + 1}–${Math.min(offset + rows.length, total)} of ${total}` : ''}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            className="px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-50"
          >Previous</button>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset(offset + PAGE_SIZE)}
            className="px-3 py-1.5 rounded-md border border-gray-300 disabled:opacity-50"
          >Next</button>
        </div>
      </div>

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
  label, value, sub, accent,
}: { label: string; value: number; sub: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="h-7 w-7 rounded-md mb-3" style={{ backgroundColor: accent ? `${accent}15` : '#F3F4F6' }} />
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="mt-1">
        <div className="text-xs font-semibold text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500">{sub}</div>
      </div>
    </div>
  );
}

function FilterChip({
  active, onClick, label, count, accent,
}: { active: boolean; onClick: () => void; label: string; count: number; accent?: string }) {
  const bg = active ? (accent ?? '#3D0740') : '#F3F4F6';
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
        style={{ backgroundColor: active ? 'rgba(255,255,255,0.25)' : 'white', color: active ? 'white' : '#6B7280' }}
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

function ProximityBadges({ row }: { row: MailingContactRow }) {
  const dA = row.distance_abor_mi;
  const dF = row.distance_fivepoints_mi;
  const nearA = dA !== null && dA !== undefined && dA <= NEAR_RADIUS_MI;
  const nearF = dF !== null && dF !== undefined && dF <= NEAR_RADIUS_MI;
  if (!nearA && !nearF) {
    if (dA === null || dA === undefined) {
      return <span className="text-[11px] text-gray-400">—</span>;
    }
    // Geocoded but outside both radii
    return <span className="text-[11px] text-gray-500">{Math.round(dA)} mi · out of range</span>;
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
    phone:          row.phone ?? '',
    mobile_phone:   row.mobile_phone ?? '',
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
        phone:          row.phone ?? '',
        mobile_phone:   row.mobile_phone ?? '',
      });
    });
  }, [row.id, row.updated_at, row.first_name, row.last_name, row.title,
      row.email, row.company, row.address, row.address_2, row.city,
      row.state, row.zip, row.license_number, row.phone, row.mobile_phone]);

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
                className="text-xs px-2.5 py-1 rounded-md bg-[#3D0740] text-white hover:bg-[#5A0E5F] disabled:opacity-50"
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
                className="text-xs px-2.5 py-1 rounded-md bg-[#3D0740] text-white hover:bg-[#5A0E5F] disabled:opacity-50"
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
            <Field label="Phone"        value={form.phone}          onChange={(v) => setField('phone', v)} type="tel" />
            <Field label="Mobile / Cell" value={form.mobile_phone}  onChange={(v) => setField('mobile_phone', v)} type="tel" />
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
            className="px-4 py-1.5 rounded-md text-sm font-medium text-white bg-[#3D0740] hover:bg-[#5A0E5F] disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, className, type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  type?: string;
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
        className="w-full px-3 py-2 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#3D0740]"
      />
    </label>
  );
}
