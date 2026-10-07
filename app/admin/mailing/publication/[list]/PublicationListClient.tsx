// app/admin/mailing/publication/[list]/PublicationListClient.tsx
//
// Browse the unified publication email list as a paged, filterable,
// sortable table with every contact detail column. Data is paged
// server-side via /api/admin/mailing/publication-list?format=page.
// "Download CSV" still hits the same endpoint with format=csv.
//
// Mailing-contact rows get Edit / Delete (PATCH / DELETE
// /api/admin/mailing/:id). App-subscriber and email-signup rows are
// managed on their own admin pages, so they show no row actions here.

'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';
import EmailBadge, { type EmailBadgeStatus } from '@/app/admin/_components/EmailBadge';
import { PAGE_SIZE_OPTIONS } from '@/app/admin/_components/Pager';
import type { PublicationCount } from '@/lib/server/mailing/publication-counts';
import type { PubId } from '@/lib/publications';
import { SEGMENTS } from '@/lib/server/mailing/segments';
import {
  EXTRA_FIELDS,
  licenseTypeLabel,
  memberTypeLabel,
} from '@/lib/server/mailing/extra-fields';

// Show the human-readable list name (e.g. 'Dallas — MetroTex') instead of
// the internal segment id when the source is a mailing segment.
function segmentLabel(id: string): string {
  return id
    .split('|')
    .map((part) => SEGMENTS.find((s) => s.segment === part)?.label ?? part)
    .join(", ");
}

type Pub = PubId;

type Row = {
  email: string;
  first_name: string;
  last_name: string;
  source_table: string;
  source_segment: string;
  status: string;
  verification_status: string;
  id?: string | null;
  d?: Record<string, string | null> | null;
};

type Facets = Record<string, Array<{ value: string; count: number }>>;

type PageResponse = {
  total: number;
  unfiltered: number;
  rows: Row[];
  facets: Facets;
};

type VerifFilter = 'all' | 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | 'unverified';
type SourceFilter = 'all' | 'mailing_contacts' | 'realtors' | 'newsletter_subscribers';

const DEFAULT_PAGE_SIZE = 50;
const PUB_LABEL: Record<Pub, string> = {
  realtyline: 'RealtyLine (Austin)',
  newsline: 'Newsline (San Antonio)',
  'realtyline-houston': 'RealtyLine (Houston)',
  'realtyline-dallas': 'RealtyLine (Dallas/Ft. Worth)',
};
const PUB_ACCENT: Record<Pub, string> = {
  realtyline: '#005a8f',
  newsline: '#1c3f5e',
  'realtyline-houston': '#005a8f',
  'realtyline-dallas': '#005a8f',
};

// Detail columns (key = field in row.d).
const DETAIL_COLUMNS: { key: string; label: string }[] = [
  { key: 'phone',          label: 'Phone' },
  { key: 'company',        label: 'Company' },
  { key: 'title',          label: 'Title' },
  { key: 'license_number', label: 'License #' },
  { key: 'address',        label: 'Street Address' },
  { key: 'address_2',      label: 'Address 2' },
  { key: 'city',           label: 'City' },
  { key: 'state',          label: 'State' },
  { key: 'zip',            label: 'ZIP' },
  { key: 'website',        label: 'Website' },
  { key: 'notes',          label: 'Notes' },
  ...EXTRA_FIELDS.map((f) => ({ key: f.id as string, label: f.label })),
];

const FILTER_FIELDS: { field: string; label: string }[] = [
  { field: 'license_type', label: 'License Type' },
  { field: 'member_type',  label: 'Member Type' },
  { field: 'role_code',    label: 'Role Code' },
  { field: 'source_file',  label: 'Source File' },
  { field: 'county',       label: 'County' },
  { field: 'city',         label: 'City' },
  { field: 'state',        label: 'State' },
  { field: 'title',        label: 'Title' },
  { field: 'office_type',  label: 'Office Type' },
];

function fmt(key: string, v: string | null | undefined): string {
  if (!v) return '';
  if (key === 'license_type') return licenseTypeLabel(v);
  if (key === 'member_type') return memberTypeLabel(v);
  return v;
}

interface Props {
  pub: Pub;
  initialCounts: PublicationCount;
}

export default function PublicationListClient({ pub, initialCounts }: Props) {
  const [data, setData] = useState<PageResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [verifFilter, setVerifFilter] = useState<VerifFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [fieldFilters, setFieldFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<string>('email');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [editing, setEditing] = useState<Row | null>(null);
  const [verifyOverrides, setVerifyOverrides] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState<Record<string, boolean>>({});

  async function verifyRow(email: string) {
    setVerifying((m) => ({ ...m, [email]: true }));
    try {
      const res = await fetch('/api/admin/email-verify/unified', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, force: true }),
      });
      const j = (await res.json()) as { ok?: boolean; row?: { status: string; sub_status: string | null } };
      if (!res.ok || !j.row) throw new Error('Verification failed');
      setVerifyOverrides((m) => ({ ...m, [email]: j.row!.status }));
      showToast(`${email}: ${j.row.status}${j.row.sub_status ? ` - ${j.row.sub_status}` : ''}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Verification failed");
    }
    setVerifying((m) => ({ ...m, [email]: false }));
  }

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  // Reset to page 1 whenever filters/search/sort change.
  useEffect(() => {
    queueMicrotask(() => setPage(1));
  }, [debouncedQuery, verifFilter, sourceFilter, fieldFilters, sort, dir, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        list: pub, format: 'page', page: String(page), pageSize: String(pageSize),
        sort, dir, verif: verifFilter, source: sourceFilter,
      });
      if (debouncedQuery.trim()) params.set('q', debouncedQuery.trim());
      for (const [k, v] of Object.entries(fieldFilters)) params.set(`f_${k}`, v);
      const r = await fetch(`/api/admin/mailing/publication-list?${params.toString()}`, {
        credentials: 'same-origin', cache: 'no-store',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setData((await r.json()) as PageResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [pub, page, pageSize, sort, dir, verifFilter, sourceFilter, debouncedQuery, fieldFilters]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 5000); };

  const onSort = (key: string) => {
    if (sort === key) setDir(dir === 'asc' ? 'desc' : 'asc');
    else { setSort(key); setDir('asc'); }
  };

  async function deleteRow(r: Row) {
    if (!r.id) return;
    const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email;
    if (!confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/mailing/${r.id}`, { method: 'DELETE', credentials: 'same-origin' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      setEditing(null);
      showToast(`Deleted ${name}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const facets = data?.facets ?? {};
  const hasFieldFilters = Object.keys(fieldFilters).length > 0;
  const accent = PUB_ACCENT[pub];

  const pagerNode = (
    <div className="flex items-center justify-between text-sm text-gray-600 flex-wrap gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          Page <span className="font-semibold">{safePage}</span> of {pageCount}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
            className="text-xs px-2 py-1 rounded border border-gray-300 bg-white"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2" style={{ visibility: pageCount > 1 ? 'visible' : 'hidden' }}>
        <button type="button" onClick={() => setPage(1)} disabled={safePage === 1} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">« First</button>
        <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">‹ Prev</button>
        <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage === pageCount} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Next ›</button>
        <button type="button" onClick={() => setPage(pageCount)} disabled={safePage === pageCount} className="px-2 py-1 rounded border border-gray-300 disabled:opacity-40">Last »</button>
      </div>
    </div>
  );

  const renderTh = (k: string, label: string, className?: string) => (
    <th
      key={k}
      className={`text-left font-medium px-3 py-2 whitespace-nowrap cursor-pointer select-none hover:text-gray-900 ${className ?? ''}`}
      onClick={() => onSort(k)}
    >
      {label}{sort === k && <span className="ml-1">{dir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  return (
    <div className="mailing-admin-page">
      <MailingBreadcrumb
        trail={[
          { label: 'Mailing', href: '/admin/mailing' },
          { label: PUB_LABEL[pub] },
        ]}
      />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.2em] text-gray-500 font-medium mb-2">
            Publication email list
          </p>
          <PageTitle size="md">{PUB_LABEL[pub]}</PageTitle>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Merged + deduped email list across segments, board mirror, app
            subscribers, and email signups. Drop rules match the CSV
            download exactly. Click a column header to sort.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/admin/mailing/publication-list?list=${pub}&format=csv`}
            className="mailing-primary-action"
          >
            <span aria-hidden>⤓</span>
            Download CSV
          </a>
        </div>
      </div>

      {/* KPI strip */}
      <div className="mailing-summary-strip grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7">
        <Kpi label="Total" value={initialCounts.total} accent={accent} />
        <Kpi label="Valid" value={initialCounts.valid} accent="#005A00" />
        <Kpi label="Invalid" value={initialCounts.invalid} accent="#661102" />
        <Kpi label="Risky" value={initialCounts.risky} accent="#645600" />
        <Kpi label="Unknown" value={initialCounts.unknown} accent="#005a8f" />
        <Kpi label="Pending" value={initialCounts.pending} accent="#51555b" />
        <Kpi label="Unverified" value={initialCounts.unverified} accent="#51555b" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search email, name, company, license #, ZIP…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[220px] max-w-md text-sm px-3 py-2 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <select
          value={verifFilter}
          onChange={(e) => setVerifFilter(e.target.value as VerifFilter)}
          className="text-sm px-3 py-2 rounded-md border border-gray-300 bg-white"
        >
          <option value="all">All verification</option>
          <option value="valid">Valid</option>
          <option value="invalid">Invalid</option>
          <option value="risky">Risky</option>
          <option value="unknown">Unknown</option>
          <option value="pending">Pending</option>
          <option value="unverified">Unverified</option>
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value as SourceFilter)}
          className="text-sm px-3 py-2 rounded-md border border-gray-300 bg-white"
        >
          <option value="all">All sources</option>
          <option value="mailing_contacts">Mailing / Holding</option>
          <option value="realtors">App subscribers</option>
          <option value="newsletter_subscribers">Email</option>
        </select>
        <span className="ml-auto text-xs text-gray-500">
          {loading ? 'Loading…' : `${total.toLocaleString()} of ${(data?.unfiltered ?? 0).toLocaleString()} shown`}
        </span>
      </div>

      {FILTER_FIELDS.some((f) => (facets[f.field]?.length ?? 0) > 0) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Filter</span>
          {FILTER_FIELDS.filter((f) => (facets[f.field]?.length ?? 0) > 0 || fieldFilters[f.field]).map((f) => (
            <select
              key={f.field}
              aria-label={`Filter by ${f.label}`}
              value={fieldFilters[f.field] ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                setFieldFilters((prev) => {
                  const next = { ...prev };
                  if (v) next[f.field] = v; else delete next[f.field];
                  return next;
                });
              }}
              className={`px-2 py-2 rounded-md border text-xs max-w-[14rem] ${fieldFilters[f.field] ? 'border-gray-900 bg-gray-50 font-medium' : 'border-gray-300 text-gray-700'}`}
            >
              <option value="">{f.label}: All</option>
              {(facets[f.field] ?? []).map((o) => (
                <option key={o.value} value={o.value}>
                  {fmt(f.field, o.value)} ({o.count.toLocaleString()})
                </option>
              ))}
            </select>
          ))}
          {hasFieldFilters && (
            <button
              type="button"
              onClick={() => setFieldFilters({})}
              className="px-2 py-2 text-xs text-gray-600 hover:text-gray-900 underline underline-offset-2"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {toast && (
        <div className="rounded-md border border-[#bbc1c9] bg-[#f5f6f9] px-4 py-3 text-sm text-[#292a2d]">{toast}</div>
      )}
      {error && (
        <div className="rounded-md border border-[#FF2A04]/30 bg-[#FFEAE6] px-4 py-3 text-sm text-[#661102]">
          {error}
        </div>
      )}

      {pagerNode}

      {/* Mobile card list */}
      <div className="sm:hidden rounded-md border border-gray-200 bg-white divide-y divide-gray-100">
        {loading && (
          <div className="px-3 py-6 text-center text-sm text-gray-500">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-gray-500">No matching rows.</div>
        )}
        {!loading && rows.map((r) => {
          const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
          const vs = verifyOverrides[r.email] ?? r.verification_status;
          const badgeStatus: EmailBadgeStatus =
            vs === 'unverified' ? null : (vs as EmailBadgeStatus);
          return (
            <div key={r.email} className="px-3 py-3 space-y-2">
              <div className="font-mono text-[13px] text-gray-900 break-all">{r.email}<button
                  type="button"
                  onClick={() => verifyRow(r.email)}
                  disabled={!!verifying[r.email]}
                  className="ml-2 px-2 py-0.5 text-xs font-medium border border-brand-700 text-brand-700 hover:bg-brand-50 disabled:opacity-50 align-middle"
                >
                  {verifying[r.email] ? 'Verifying…' : 'Verify'}
                </button></div>
              <div className="text-sm text-gray-800">{name}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                <dt className="text-gray-500 uppercase tracking-wider">Source</dt>
                <dd className="text-gray-800 text-right break-words">{prettySource(r.source_table)}</dd>
                <dt className="text-gray-500 uppercase tracking-wider">Segment</dt>
                <dd className="text-gray-800 text-right break-words">{segmentLabel(r.source_segment)}</dd>
                {DETAIL_COLUMNS.filter((c) => r.d?.[c.key]).map((c) => (
                  <Fragment key={c.key}>
                    <dt className="text-gray-500 uppercase tracking-wider">{c.label}</dt>
                    <dd className="text-gray-800 text-right break-words">{fmt(c.key, r.d?.[c.key])}</dd>
                  </Fragment>
                ))}
              </dl>
              <div className="pt-0.5 flex items-center gap-2">
                <EmailBadge status={badgeStatus} />
                {r.id && (
                  <>
                    <button type="button" onClick={() => setEditing(r)} className="px-2 py-1 rounded border border-gray-300 text-[11px] font-medium text-gray-700">Edit</button>
                    <button type="button" onClick={() => void deleteRow(r)} className="px-2 py-1 rounded border border-[#FF2A04]/50 text-[11px] font-medium text-[#661102]">Delete</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden sm:block overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              {renderTh("email", "Email")}
              {renderTh("name", "Name")}
              {renderTh("source", "Source")}
              {renderTh("segment", "Segment")}
              {renderTh("verification", "Verification")}
              {DETAIL_COLUMNS.map((c) => renderTh(c.key, c.label))}
              <th className="text-left font-medium px-3 py-2 sticky right-0 bg-gray-50">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6 + DETAIL_COLUMNS.length} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6 + DETAIL_COLUMNS.length} className="px-3 py-6 text-center text-gray-500">
                  No matching rows.
                </td>
              </tr>
            )}
            {!loading && rows.map((r) => {
              const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
              const vs = verifyOverrides[r.email] ?? r.verification_status;
              const badgeStatus: EmailBadgeStatus =
                vs === 'unverified' ? null : (vs as EmailBadgeStatus);
              return (
                <tr key={r.email} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-[13px] text-gray-900 whitespace-nowrap">{r.email}<button
                  type="button"
                  onClick={() => verifyRow(r.email)}
                  disabled={!!verifying[r.email]}
                  className="ml-2 px-2 py-0.5 text-xs font-medium border border-brand-700 text-brand-700 hover:bg-brand-50 disabled:opacity-50 align-middle"
                >
                  {verifying[r.email] ? 'Verifying…' : 'Verify'}
                </button></td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{name}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{prettySource(r.source_table)}</td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{segmentLabel(r.source_segment)}</td>
                  <td className="px-3 py-2">
                    <EmailBadge status={badgeStatus} />
                  </td>
                  {DETAIL_COLUMNS.map((c) => {
                    const v = fmt(c.key, r.d?.[c.key]);
                    return (
                      <td key={c.key} className="px-3 py-2 text-gray-700 text-xs whitespace-nowrap max-w-[18rem] truncate" title={v}>
                        {v}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 sticky right-0 bg-white">
                    {r.id ? (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => setEditing(r)} className="px-2 py-1 rounded border border-gray-300 text-[11px] font-medium text-gray-700 hover:bg-gray-50">Edit</button>
                        <button type="button" onClick={() => void deleteRow(r)} className="px-2 py-1 rounded border border-[#FF2A04]/50 text-[11px] font-medium text-[#661102] hover:bg-[#FFEAE6]">Delete</button>
                      </div>
                    ) : (
                      <span className="text-[11px] text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {pagerNode}

      <div className="text-xs text-gray-500">
        <Link href="/admin/mailing" className="underline hover:text-gray-700">
          ← Back to Mailing Hub
        </Link>
      </div>

      {editing && editing.id && (
        <EditModal
          row={editing}
          onClose={() => setEditing(null)}
          onDelete={() => void deleteRow(editing)}
          onSaved={async () => { setEditing(null); showToast('Saved.'); await load(); }}
        />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Edit modal — every editable contact field. Saves only changed fields.

const EDIT_FIELDS: { key: string; label: string; wide?: boolean }[] = [
  { key: 'first_name', label: 'First Name' },
  { key: 'last_name', label: 'Last Name' },
  { key: 'email', label: 'Email', wide: true },
  { key: 'phone', label: 'Phone' },
  { key: 'title', label: 'Title' },
  { key: 'company', label: 'Company', wide: true },
  { key: 'license_number', label: 'TREC License #' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Street Address', wide: true },
  { key: 'address_2', label: 'Address 2', wide: true },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'zip', label: 'ZIP' },
  ...EXTRA_FIELDS.map((f) => ({
    key: f.id as string,
    label: f.id === 'license_type' ? 'License Type (Salesperson / Broker)' : f.label,
    wide: f.id === 'mail_address' || f.id === 'designated_realtor',
  })),
  { key: 'notes', label: 'Notes', wide: true },
];

function initialValues(row: Row): Record<string, string> {
  const out: Record<string, string> = {
    first_name: row.first_name ?? '',
    last_name: row.last_name ?? '',
    email: row.email ?? '',
  };
  for (const f of EDIT_FIELDS) {
    if (f.key in out) continue;
    out[f.key] = row.d?.[f.key] ?? '';
  }
  return out;
}

function EditModal({
  row, onClose, onSaved, onDelete,
}: {
  row: Row;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  onDelete: () => void;
}) {
  const [initial] = useState(() => initialValues(row));
  const [form, setForm] = useState<Record<string, string>>(() => initialValues(row));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    const patch: Record<string, string | null> = {};
    for (const k of Object.keys(form)) {
      if (form[k] !== initial[k]) patch[k] = form[k].trim() === '' ? null : form[k].trim();
    }
    if (Object.keys(patch).length === 0) { onClose(); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch(`/api/admin/mailing/${row.id}`, {
        method: 'PATCH', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.detail || j?.error || `HTTP ${res.status}`);
      await onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div className="h-full w-full max-w-xl overflow-y-auto bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <div className="text-lg font-semibold text-gray-900">
              {[form.first_name, form.last_name].filter(Boolean).join(' ') || 'Contact'}
            </div>
            <div className="text-xs text-gray-500">{segmentLabel(row.source_segment)}</div>
          </div>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-900 text-xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="grid grid-cols-2 gap-3 px-6 py-4">
          {EDIT_FIELDS.map((f) => (
            <label key={f.key} className={`block ${f.wide ? 'col-span-2' : ''}`}>
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500">{f.label}</span>
              {f.key === 'notes' ? (
                <textarea
                  value={form[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              ) : (
                <input
                  type="text"
                  value={form[f.key]}
                  onChange={(e) => setForm((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                />
              )}
            </label>
          ))}
        </div>
        {err && <div className="mx-6 mb-3 rounded-md border border-[#FF2A04]/30 bg-[#FFEAE6] px-3 py-2 text-xs text-[#661102]">{err}</div>}
        <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-gray-200 bg-white px-6 py-3">
          <button type="button" onClick={onDelete} className="mr-auto rounded-md border border-[#FF2A04]/50 px-3 py-2 text-sm text-[#661102] hover:bg-[#FFEAE6]">Delete</button>
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">Cancel</button>
          <button type="button" disabled={saving} onClick={save} className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

function prettySource(s: string): string {
  switch (s) {
    case 'mailing_contacts': return 'Mailing / Holding';
    case 'realtors': return 'App subscribers';
    case 'newsletter_subscribers': return 'Email';
    default: return s;
  }
}

function Kpi({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-white p-3">
      <div
        className="h-2 w-8 rounded-full mb-2"
        style={{ backgroundColor: accent }}
      />
      <div className="text-xl font-bold text-gray-900">{value.toLocaleString()}</div>
      <div className="text-[11px] font-medium text-gray-600">{label}</div>
    </div>
  );
}
