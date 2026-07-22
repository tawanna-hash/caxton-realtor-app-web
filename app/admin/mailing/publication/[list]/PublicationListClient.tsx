// app/admin/mailing/publication/[list]/PublicationListClient.tsx
//
// Browse the unified publication email list as a paged, filterable
// table. Pulls JSON from /api/admin/mailing/publication-list?format=json,
// then paginates + filters client-side. "Download CSV" hits the same
// endpoint with format=csv.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PageTitle from '@/components/ui/PageTitle';
import MailingBreadcrumb from '@/components/admin/MailingBreadcrumb';
import EmailBadge, { type EmailBadgeStatus } from '@/app/admin/_components/EmailBadge';
import { PAGE_SIZE_OPTIONS } from '@/app/admin/_components/Pager';
import type { PublicationCount } from '@/lib/server/mailing/publication-counts';

type Pub = 'realtyline' | 'newsline';

type Row = {
  email: string;
  first_name: string;
  last_name: string;
  source_table: string;
  source_segment: string;
  status: string;
  verification_status: string;
};

type ApiResponse = {
  publication: Pub;
  raw_pulled: number;
  dropped_invalid_email: number;
  dropped_status: number;
  collapsed_duplicates: number;
  final_unique_emails: number;
  rows: Row[];
};

type VerifFilter = 'all' | 'valid' | 'invalid' | 'risky' | 'unknown' | 'pending' | 'unverified';
type SourceFilter = 'all' | 'mailing_contacts' | 'realtors' | 'newsletter_subscribers';

const DEFAULT_PAGE_SIZE = 50;
const PUB_LABEL: Record<Pub, string> = {
  realtyline: 'RealtyLine (Austin)',
  newsline: 'Newsline (San Antonio)',
};
const PUB_ACCENT: Record<Pub, string> = {
  realtyline: '#301D5D',
  newsline: '#c2410c',
};

interface Props {
  pub: Pub;
  initialCounts: PublicationCount;
}

export default function PublicationListClient({ pub, initialCounts }: Props) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState('');
  const [verifFilter, setVerifFilter] = useState<VerifFilter>('all');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetch(`/api/admin/mailing/publication-list?list=${pub}&format=json`, {
      credentials: 'same-origin',
      cache: 'no-store',
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return (await r.json()) as ApiResponse;
      })
      .then((data) => {
        if (cancelled) return;
        setRows(data.rows);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e?.message || e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pub]);

  // Reset to page 1 whenever filters/search change.
  useEffect(() => {
    queueMicrotask(() => setPage(1));
  }, [query, verifFilter, sourceFilter]);

  const filtered = useMemo(() => {
    if (!rows) return [] as Row[];
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (verifFilter !== 'all' && r.verification_status !== verifFilter) return false;
      if (sourceFilter !== 'all' && r.source_table !== sourceFilter) return false;
      if (!q) return true;
      return (
        r.email.toLowerCase().includes(q) ||
        r.first_name.toLowerCase().includes(q) ||
        r.last_name.toLowerCase().includes(q) ||
        r.source_segment.toLowerCase().includes(q)
      );
    });
  }, [rows, query, verifFilter, sourceFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const accent = PUB_ACCENT[pub];

  // Pager rendered both above and below the table so users don't need to
  // scroll past every row to change page size or page number.
  const pagerNode = !loading ? (
    <div className="flex items-center justify-between text-sm text-gray-600 flex-wrap gap-3">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          Page <span className="font-semibold">{safePage}</span> of {pageCount}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <span>Rows</span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setPage(1); }}
            className="text-xs px-1.5 py-1 rounded border border-gray-300 bg-white"
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
  ) : null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
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
            subscribers, and newsletter signups. Drop rules match the CSV
            download exactly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/admin/mailing/publication-list?list=${pub}&format=csv`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border text-xs font-semibold transition hover:text-white"
            style={{ borderColor: accent, color: accent, ['--hover-bg' as string]: accent }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.backgroundColor = accent;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.backgroundColor = '';
            }}
          >
            <span aria-hidden>⤓</span>
            Download CSV
          </a>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <Kpi label="Total" value={initialCounts.total} accent={accent} />
        <Kpi label="Valid" value={initialCounts.valid} accent="#059669" />
        <Kpi label="Invalid" value={initialCounts.invalid} accent="#e11d48" />
        <Kpi label="Risky" value={initialCounts.risky} accent="#d97706" />
        <Kpi label="Unknown" value={initialCounts.unknown} accent="#ea580c" />
        <Kpi label="Pending" value={initialCounts.pending} accent="#475569" />
        <Kpi label="Unverified" value={initialCounts.unverified} accent="#6b7280" />
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search email, name, segment…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[220px] max-w-md text-sm px-3 py-1.5 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-300"
        />
        <select
          value={verifFilter}
          onChange={(e) => setVerifFilter(e.target.value as VerifFilter)}
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 bg-white"
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
          className="text-sm px-3 py-1.5 rounded-md border border-gray-300 bg-white"
        >
          <option value="all">All sources</option>
          <option value="mailing_contacts">Mailing / Holding</option>
          <option value="realtors">App subscribers</option>
          <option value="newsletter_subscribers">Newsletter</option>
        </select>
        <span className="ml-auto text-xs text-gray-500">
          {loading ? 'Loading…' : `${filtered.length.toLocaleString()} of ${(rows?.length ?? 0).toLocaleString()} shown`}
        </span>
      </div>

      {error && (
        <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          Failed to load list: {error}
        </div>
      )}

      {/* Top pager mirrors the bottom one. */}
      {pagerNode}

      {/* Table */}
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left font-medium px-3 py-2">Email</th>
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-left font-medium px-3 py-2">Source</th>
              <th className="text-left font-medium px-3 py-2">Segment</th>
              <th className="text-left font-medium px-3 py-2">Verification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && pageRows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                  No matching rows.
                </td>
              </tr>
            )}
            {!loading && pageRows.map((r) => {
              const name = [r.first_name, r.last_name].filter(Boolean).join(' ') || '—';
              const badgeStatus: EmailBadgeStatus =
                r.verification_status === 'unverified' ? null : (r.verification_status as EmailBadgeStatus);
              return (
                <tr key={r.email} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-[13px] text-gray-900 break-all">{r.email}</td>
                  <td className="px-3 py-2 text-gray-700">{name}</td>
                  <td className="px-3 py-2 text-gray-700">{prettySource(r.source_table)}</td>
                  <td className="px-3 py-2 text-gray-700">{r.source_segment}</td>
                  <td className="px-3 py-2">
                    <EmailBadge status={badgeStatus} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pager */}
      {pagerNode}

      <div className="text-xs text-gray-500">
        <Link href="/admin/mailing" className="underline hover:text-gray-700">
          ← Back to Mailing Hub
        </Link>
      </div>
    </div>
  );
}

function prettySource(s: string): string {
  switch (s) {
    case 'mailing_contacts': return 'Mailing / Holding';
    case 'realtors': return 'App subscribers';
    case 'newsletter_subscribers': return 'Newsletter';
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
