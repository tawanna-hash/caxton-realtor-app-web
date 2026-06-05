'use client';

// app/admin/mailing/[segment]/MailingClient.tsx
//
// Client UI for one mailing segment. Handles list + search + sort, manual
// add, bulk delete, dedupe, CSV/TSV/JSON import + export, and (Advertisers
// only) the "Sync from advertisers" action.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  MAILING_COLUMNS,
  DEFAULT_VISIBLE_COLUMNS,
  guessField,
  splitFullName,
  type MailingColumnId,
  type MailingContactRow,
  type MailingSegment,
  type CanonicalImportField,
} from '@/lib/mailing';

type Counts = { total: number; 'manual-newsline': number; 'non-advertiser': number; realtor: number };
type Stats  = {
  total:       number;
  uspsValid:   number;
  uspsInvalid: number;
  uspsPending: number;
  unverified:  number;
  withEmail:   number;
  withAddress: number;
};

type Props = {
  segment: MailingSegment;
  slug: string;
  label: string;
  accent: string;
};

const PAGE_SIZE = 100;

export default function MailingClient({ segment, slug, label, accent }: Props) {
  const [rows, setRows] = useState<MailingContactRow[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [stats, setStats]   = useState<Stats | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState<string>('');
  const [sort, setSort] = useState<MailingColumnId>('created_at');
  const [dir, setDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState<number>(0);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [visibleCols, setVisibleCols] = useState<Set<MailingColumnId>>(
    () => new Set(DEFAULT_VISIBLE_COLUMNS),
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        segment,
        sort,
        dir,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/admin/mailing?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      }
      const data = await res.json() as { rows: MailingContactRow[]; total: number; counts: Counts; stats?: Stats };
      setRows(data.rows);
      setTotal(data.total);
      setCounts(data.counts);
      if (data.stats) setStats(data.stats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [segment, sort, dir, offset, search]);

  // queueMicrotask wraps to satisfy react-hooks/set-state-in-effect by
  // deferring the state updates one tick after the effect commits.
  useEffect(() => {
    queueMicrotask(() => { reload(); });
  }, [reload]);

  // Reset offset + selection when filters change
  useEffect(() => {
    queueMicrotask(() => {
      setOffset(0);
      setSelectedIds(new Set());
    });
  }, [segment, search, sort, dir]);

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));

  function toggleSelectAll() {
    if (allOnPageSelected) {
      const next = new Set(selectedIds);
      for (const r of rows) next.delete(r.id);
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      for (const r of rows) next.add(r.id);
      setSelectedIds(next);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  function changeSort(col: MailingColumnId) {
    if (col === sort) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSort(col);
      setDir('asc');
    }
  }

  async function handleDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} contact(s)? This cannot be undone.`)) return;
    setBusy('Deleting…');
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

  async function handleDeleteAllInSegment() {
    const inSegment = counts?.[segment] ?? 0;
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

  async function handleVerifyAddresses() {
    // Verify USPS addresses for selected rows, or all rows on the
    // current page if no rows are selected. Per-row API call (USPS v3
    // is single-address per request), throttled to ~5/sec.
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

  async function handleDedupe() {
    if (!confirm(`Dedupe ${label}? Rows with the same email (or name+phone) will be merged, keeping the oldest.`)) return;
    setBusy('Deduping…');
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
    window.open(url, '_blank');
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/admin/mailing" className="hover:text-gray-900">Mailing</Link>
          <span>›</span>
          <span className="text-gray-900">{label}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
              Mailing list
            </p>
            <h1 className="font-serif text-3xl text-gray-900">{label}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {counts ? `${counts[segment].toLocaleString()} in segment · ${counts.total.toLocaleString()} total across all segments` : '…'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setShowAdd(true)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
              + Add contact
            </button>
            <button onClick={() => setShowImport(true)} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
              Import
            </button>
            <div className="relative inline-block group">
              <button className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
                Export ▾
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10 bg-white border border-gray-200 rounded-md shadow-sm py-1 min-w-[140px]">
                <button onClick={() => handleExport('csv')}  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">CSV</button>
                <button onClick={() => handleExport('tsv')}  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">TSV</button>
                <button onClick={() => handleExport('json')} className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50">JSON</button>
              </div>
            </div>
            <button onClick={handleDedupe} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
              Dedupe
            </button>
            <button
              onClick={handleVerifyAddresses}
              className="px-3 py-1.5 text-sm rounded-md text-white"
              style={{ backgroundColor: '#3D0740' }}
              title="Run USPS Address API on selected rows (or this page if none selected)"
            >
              Verify USPS{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
            </button>
            <button
              onClick={handleDeleteAllInSegment}
              className="px-3 py-1.5 text-sm rounded-md border border-red-300 text-red-700 hover:bg-red-50"
            >
              Delete all
            </button>
            {/* Sync-from-advertisers hidden: Manual Newsline Contacts is manual-only. */}
          </div>
        </div>
      </div>

      {/* KPI strip — segment-specific stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="In segment"    value={stats?.total       ?? 0} sub="all contacts"            accent={accent} />
        <KpiCard label="USPS Valid"    value={stats?.uspsValid   ?? 0} sub="verified addresses"      accent="#10B981" />
        <KpiCard label="USPS Invalid"  value={stats?.uspsInvalid ?? 0} sub={'USPS couldn\u2019t verify'} accent="#EF4444" />
        <KpiCard label="Pending"       value={stats?.uspsPending ?? 0} sub="awaiting re-check"       accent="#F59E0B" />
        <KpiCard label="Unverified"    value={stats?.unverified  ?? 0} sub="never run through USPS"  accent="#6B7280" />
        <KpiCard label="With email"    value={stats?.withEmail   ?? 0} sub="emailable"               accent="#3D0740" />
      </div>

      {/* Filters bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, email, company, city…"
          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-200"
        />
        <ColumnPicker visible={visibleCols} setVisible={setVisibleCols} />
        {selectedIds.size > 0 && (
          <button
            onClick={handleDelete}
            className="px-3 py-2 text-sm rounded-md border border-red-300 text-red-700 hover:bg-red-50"
          >
            Delete {selectedIds.size}
          </button>
        )}
      </div>

      {busy && (
        <div className="text-sm text-gray-600 italic">{busy}</div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="w-10 px-3 py-2 text-left">
                <input type="checkbox" checked={allOnPageSelected} onChange={toggleSelectAll} aria-label="Select all on page" />
              </th>
              {MAILING_COLUMNS.filter((c) => visibleCols.has(c.id)).map((c) => (
                <th
                  key={c.id}
                  className={`px-3 py-2 text-left font-semibold text-gray-700 whitespace-nowrap ${c.sortable ? 'cursor-pointer select-none' : ''}`}
                  onClick={() => c.sortable && changeSort(c.id)}
                >
                  {c.label}
                  {c.sortable && sort === c.id && (
                    <span className="ml-1 text-gray-400">{dir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={visibleCols.size + 1} className="px-3 py-8 text-center text-gray-500">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={visibleCols.size + 1} className="px-3 py-8 text-center text-gray-500">No contacts yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleOne(r.id)}
                      aria-label="Select row"
                    />
                  </td>
                  {MAILING_COLUMNS.filter((c) => visibleCols.has(c.id)).map((c) => (
                    <td key={c.id} className="px-3 py-2 text-gray-800 whitespace-nowrap">
                      {renderCell(r, c.id)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div>
            Showing {offset + 1}–{Math.min(offset + rows.length, total)} of {total.toLocaleString()}
          </div>
          <div className="flex gap-2">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(offset - PAGE_SIZE, 0))}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50"
            >
              Prev
            </button>
            <button
              disabled={offset + rows.length >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="px-3 py-1 border border-gray-300 rounded-md disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {showAdd && <AddDialog segment={segment} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); reload(); }} />}
      {showImport && <ImportDialog segment={segment} onClose={() => setShowImport(false)} onDone={() => { setShowImport(false); reload(); }} />}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────

function renderCell(r: MailingContactRow, col: MailingColumnId): ReactNode {
  if (col === 'created_at') {
    try {
      return new Date(r.created_at).toLocaleDateString();
    } catch {
      return r.created_at ?? '';
    }
  }
  if (col === 'addr_status') {
    const s = r.addr_status;
    if (s === 'Valid') {
      return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800">Valid</span>;
    }
    if (s === 'Invalid') {
      return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-red-100 text-red-800">Invalid</span>;
    }
    if (s === 'Pending') {
      return <span className="inline-block px-2 py-0.5 text-xs rounded-full bg-amber-100 text-amber-800">Pending</span>;
    }
    return <span className="text-gray-400">—</span>;
  }
  const v = r[col];
  return v == null ? '' : String(v);
}

// ──────────────────────────────────────────────────────────────
// Column picker (dropdown of checkboxes)

function ColumnPicker({
  visible, setVisible,
}: { visible: Set<MailingColumnId>; setVisible: (s: Set<MailingColumnId>) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="px-3 py-2 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
      >
        Columns
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 bg-white border border-gray-200 rounded-md shadow-md p-2 min-w-[200px]">
          {MAILING_COLUMNS.map((c) => (
            <label key={c.id} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-gray-50 rounded">
              <input
                type="checkbox"
                checked={visible.has(c.id)}
                onChange={() => {
                  const next = new Set(visible);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  setVisible(next);
                }}
              />
              {c.label}
            </label>
          ))}
        </div>
      )}
    </div>
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
      <div className="bg-white rounded-lg max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-xl text-gray-900 mb-4">Add contact</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="First name *" value={form.first_name}     onChange={(v) => set('first_name', v)} />
          <Field label="Last name"    value={form.last_name}      onChange={(v) => set('last_name', v)} />
          <Field label="Email"        value={form.email}          onChange={(v) => set('email', v)} type="email" />
          <Field label="Phone"        value={form.phone}          onChange={(v) => set('phone', v)} />
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
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, type = 'text', className = '',
}: { label: string; value: string; onChange: (v: string) => void; type?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs font-medium text-gray-700 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
      <div className="bg-white rounded-lg max-w-3xl w-full p-6 max-h-[90vh] overflow-y-auto">
        <h2 className="font-serif text-xl text-gray-900 mb-1">Import contacts</h2>
        <p className="text-sm text-gray-600 mb-4">CSV, TSV, or JSON. Headers will be auto-mapped — review and adjust before importing.</p>

        {step === 'pick' && (
          <div
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center transition ${
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
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50">
            {step === 'go' ? 'Close' : 'Cancel'}
          </button>
          {step === 'map' && (
            <button onClick={runImport} disabled={running} className="px-3 py-1.5 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50">
              {running ? 'Importing…' : `Import ${rows.length} rows`}
            </button>
          )}
          {step === 'go' && (
            <button onClick={onDone} className="px-3 py-1.5 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800">
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

// ──────────────────────────────────────────────────────────────
// Compact KPI card — segment stats strip.

function KpiCard({
  label, value, sub, accent,
}: { label: string; value: number; sub: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div
        className="h-7 w-7 rounded-md mb-3"
        style={{ backgroundColor: accent ? `${accent}15` : '#F3F4F6' }}
      />
      <div className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="mt-1">
        <div className="text-xs font-semibold text-gray-900">{label}</div>
        <div className="text-[11px] text-gray-500">{sub}</div>
      </div>
    </div>
  );
}
