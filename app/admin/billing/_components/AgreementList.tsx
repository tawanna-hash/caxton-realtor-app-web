'use client';

// app/admin/billing/_components/AgreementList.tsx
//
// Read-only table of agreements with a row-click → open drawer affordance
// and inline email/PDF actions.

import type { AgreementWithAdvertiser } from '@/lib/agreements';
import { formatCents } from '@/lib/invoices';
import { StatusPill } from './Badges';
import { AG_STATUS, AG_TYPES } from './constants';

export function AgreementList({
  rows, onOpen, onEmail,
}: {
  rows: AgreementWithAdvertiser[];
  onOpen: (r: AgreementWithAdvertiser) => void;
  onEmail?: (r: AgreementWithAdvertiser) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">No agreements yet.</div>;
  }
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
        <div className="col-span-3">Advertiser</div>
        <div className="col-span-2">Type · Size</div>
        <div className="col-span-2">Term</div>
        <div className="col-span-2">Amount</div>
        <div className="col-span-1">Invoiced</div>
        <div className="col-span-2">Status · Actions</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-12 gap-3 px-4 py-3 items-center hover:bg-blue-50/40">
            <button onClick={() => onOpen(r)} className="col-span-3 text-left min-w-0">
              <div className="font-medium text-gray-900 truncate">{r.advertiser_name ?? r.company_name ?? '—'}</div>
              <div className="text-xs text-gray-500 truncate">{r.rep_name ?? r.advertiser_email ?? ''}</div>
            </button>
            <button onClick={() => onOpen(r)} className="col-span-2 text-left text-sm text-gray-700">
              <div>{AG_TYPES.find((t) => t.value === r.type)?.label ?? r.type ?? '—'}</div>
              <div className="text-xs text-gray-500">{r.ad_size ?? ''} {r.frequency ? `· ${r.frequency}` : ''}</div>
            </button>
            <button onClick={() => onOpen(r)} className="col-span-2 text-left text-sm text-gray-700">
              {r.start_date ? new Date(r.start_date).toLocaleDateString() : '—'}
              {' → '}
              {r.end_date ? new Date(r.end_date).toLocaleDateString() : '—'}
            </button>
            {/* BUG-39: disambiguate "—" (no contract amount set) from $0.00 invoiced. */}
            <button
              onClick={() => onOpen(r)}
              title={r.amount_cents == null ? 'No contract amount set yet — open the agreement to add one.' : undefined}
              className={`col-span-2 text-left text-sm ${r.amount_cents == null ? 'text-amber-700' : 'text-gray-900'}`}
            >
              {r.amount_cents == null ? 'Not set' : formatCents(r.amount_cents)}
            </button>
            <button onClick={() => onOpen(r)} className="col-span-1 text-left text-sm text-gray-700">{formatCents(r.invoiced_cents)}</button>
            <div className="col-span-2 flex items-center gap-1 flex-wrap">
              <StatusPill value={r.status} options={AG_STATUS} />
              <button
                title="Send signing link email"
                onClick={() => onEmail?.(r)}
                className="p-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
              >✉</button>
              <a
                href={`/api/admin/agreements/${r.id}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
                title="Download PDF"
                className="p-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
              >PDF</a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
