'use client';

// app/admin/billing/_components/AgreementList.tsx
//
// Read-only table of agreements with a row-click → open drawer affordance
// and inline email/PDF actions.
//
// Rows are grouped under a per-company header. Each company has a
// sticky-ish gray bar showing the company name and an agreement count;
// agreements within the company are sorted by updated_at desc (the
// upstream query already returns them in that order, so we preserve it
// here when bucketing).

import type { AgreementWithAdvertiser } from '@/lib/agreements';
import { formatCents } from '@/lib/invoices';
import { StatusPill } from './Badges';
import { AG_STATUS, AG_TYPES } from './constants';

type Bucket = {
  key: string;
  label: string;
  rows: AgreementWithAdvertiser[];
};

/**
 * Group agreements under a stable company label.
 *
 * Bucketing rules:
 *  - Prefer advertiser_id when present (canonical join key).
 *  - Else fall back to a lower-cased company_name / advertiser_name.
 *  - Else bucket under "Unassigned" — these rows have no advertiser link
 *    yet (e.g. freshly uploaded PDF stubs waiting for triage).
 *
 * The label displayed to the user is the first non-empty of
 * advertiser_name / company_name seen for the bucket — so even if later
 * rows have stale or missing names, the header stays consistent.
 */
function groupRows(rows: AgreementWithAdvertiser[]): Bucket[] {
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const id = r.advertiser_id != null ? `adv:${r.advertiser_id}` : null;
    const nameKey = (r.company_name ?? r.advertiser_name ?? '').trim().toLowerCase();
    const key = id ?? (nameKey ? `name:${nameKey}` : 'unassigned');
    const existing = buckets.get(key);
    const label =
      existing?.label
      ?? r.advertiser_name
      ?? r.company_name
      ?? (key === 'unassigned' ? 'Unassigned' : '—');
    if (existing) {
      existing.rows.push(r);
    } else {
      buckets.set(key, { key, label, rows: [r] });
    }
  }
  // Stable ordering: bucket order follows the first appearance of each
  // company in the upstream-sorted list. Unassigned floats to the bottom
  // so it doesn't push real companies down on first paint.
  const ordered = Array.from(buckets.values());
  ordered.sort((a, b) => {
    if (a.key === 'unassigned' && b.key !== 'unassigned') return 1;
    if (b.key === 'unassigned' && a.key !== 'unassigned') return -1;
    return 0;
  });
  return ordered;
}

function AgreementRowLayout({ row: r, onOpen, onEmail }: {
  row: AgreementWithAdvertiser;
  onOpen: () => void;
  onEmail?: () => void;
}) {
  const typeLabel = AG_TYPES.find((t) => t.value === r.type)?.label ?? r.type ?? '—';
  const sizeFreq = `${r.ad_size ?? ''} ${r.frequency ? `· ${r.frequency}` : ''}`.trim();
  const term = `${r.start_date ? new Date(r.start_date).toLocaleDateString() : '—'} → ${r.end_date ? new Date(r.end_date).toLocaleDateString() : '—'}`;

  const advertiserCell = (
    <button onClick={onOpen} className="text-left min-w-0 w-full sm:w-auto">
      <div className="font-medium text-gray-900 truncate">{r.advertiser_name ?? r.company_name ?? '—'}</div>
      <div className="text-xs text-gray-500 truncate">{r.rep_name ?? r.advertiser_email ?? ''}</div>
    </button>
  );

  const actionsCell = (
    <div className="flex items-center gap-1 flex-wrap">
      <StatusPill value={r.status} options={AG_STATUS} />
      <button
        title="Send signing link email"
        onClick={onEmail}
        className="p-1 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
      >✉</button>
      <a
        href={`/api/admin/agreements/${r.id}/pdf`}
        target="_blank"
        rel="noopener noreferrer"
        title="Download PDF"
        className="p-1 text-xs rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50"
      >PDF</a>
    </div>
  );

  return (
    <>
      {/* Desktop */}
      <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-blue-50/40">
        <div className="col-span-3">{advertiserCell}</div>
        <button onClick={onOpen} className="col-span-2 text-left text-sm text-gray-700">
          <div>{typeLabel}</div>
          <div className="text-xs text-gray-500">{sizeFreq}</div>
        </button>
        <button onClick={onOpen} className="col-span-2 text-left text-sm text-gray-700">{term}</button>
        <button
          onClick={onOpen}
          title={r.amount_cents == null ? 'No contract amount set yet — open the agreement to add one.' : undefined}
          className={`col-span-2 text-left text-sm ${r.amount_cents == null ? 'text-amber-700' : 'text-gray-900'}`}
        >
          {r.amount_cents == null ? 'Not set' : formatCents(r.amount_cents)}
        </button>
        <button onClick={onOpen} className="col-span-1 text-left text-sm text-gray-700">{formatCents(r.invoiced_cents)}</button>
        <div className="col-span-2">{actionsCell}</div>
      </div>

      {/* Mobile card */}
      <div className="sm:hidden px-4 py-3 space-y-2 hover:bg-blue-50/40">
        {advertiserCell}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-gray-500 uppercase tracking-wider">Type</dt>
          <dd className="text-gray-800 text-right">{typeLabel}{sizeFreq && <span className="text-gray-500"> · {sizeFreq}</span>}</dd>
          <dt className="text-gray-500 uppercase tracking-wider">Term</dt>
          <dd className="text-gray-800 text-right">{term}</dd>
          <dt className="text-gray-500 uppercase tracking-wider">Amount</dt>
          <dd className={`text-right ${r.amount_cents == null ? 'text-amber-700' : 'text-gray-900'}`}>{r.amount_cents == null ? 'Not set' : formatCents(r.amount_cents)}</dd>
          <dt className="text-gray-500 uppercase tracking-wider">Invoiced</dt>
          <dd className="text-gray-800 text-right">{formatCents(r.invoiced_cents)}</dd>
        </dl>
        {actionsCell}
      </div>
    </>
  );
}

export function AgreementList({
  rows, onOpen, onEmail,
}: {
  rows: AgreementWithAdvertiser[];
  onOpen: (r: AgreementWithAdvertiser) => void;
  onEmail?: (r: AgreementWithAdvertiser) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-md border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">No agreements yet.</div>;
  }
  const buckets = groupRows(rows);
  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      {/* Column header bar — shown once at the top, not per bucket */}
      <div className="hidden sm:grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
        <div className="col-span-3">Advertiser</div>
        <div className="col-span-2">Type &middot; Size</div>
        <div className="col-span-2">Term</div>
        <div className="col-span-2">Amount</div>
        <div className="col-span-1">Invoiced</div>
        <div className="col-span-2">Status &middot; Actions</div>
      </div>

      {buckets.map((b) => (
        <div key={b.key} className="border-b border-gray-200 last:border-b-0">
          {/* Company header row */}
          <div className="flex items-baseline justify-between gap-3 px-4 py-2 bg-gray-100/70 border-b border-gray-200">
            <div className="text-[13px] font-semibold text-gray-800 truncate">{b.label}</div>
            <div className="text-[11px] uppercase tracking-wider text-gray-500">
              {b.rows.length} {b.rows.length === 1 ? 'agreement' : 'agreements'}
            </div>
          </div>

          <div className="divide-y divide-gray-100">
            {b.rows.map((r) => (
              <AgreementRowLayout
                key={r.id}
                row={r}
                onOpen={() => onOpen(r)}
                onEmail={onEmail ? () => onEmail(r) : undefined}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
