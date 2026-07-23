'use client';

// app/admin/billing/_components/InvoiceList.tsx
//
// Read-only table of invoices with paid/overdue badges. Draft rows expose a
// hover "Delete" action (the DELETE API only allows draft invoices).

import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents } from '@/lib/invoices';
import { StatusPill, PaidStamp, UnpaidBadge } from './Badges';
import { INV_STATUS } from './constants';

export function InvoiceList({
  rows, onOpen, onDelete,
}: {
  rows: InvoiceWithAdvertiser[];
  onOpen: (r: InvoiceWithAdvertiser) => void;
  onDelete?: (r: InvoiceWithAdvertiser) => void;
}) {
  if (rows.length === 0) {
    return <div className="rounded-md border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">No invoices yet.</div>;
  }
  return (
    <div className="rounded-md border border-gray-200 bg-white overflow-hidden">
      <div className="grid grid-cols-12 gap-3 px-4 py-2 text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200 bg-gray-50">
        <div className="col-span-2">Number</div>
        <div className="col-span-3">Advertiser</div>
        <div className="col-span-2">Total</div>
        <div className="col-span-2">Due</div>
        <div className="col-span-2">Payment</div>
        <div className="col-span-1">Status</div>
      </div>
      <div className="divide-y divide-gray-100">
        {rows.map((r) => {
          const isPaid = r.status === 'paid';
          const isVoid = r.status === 'void';
          const isDraft = r.status === 'draft';
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpen(r)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(r); } }}
              className={`group relative w-full grid grid-cols-12 gap-3 px-4 py-3 text-left hover:bg-blue-50/40 cursor-pointer ${isPaid ? 'bg-emerald-50/30' : ''}`}
            >
              <div className="col-span-2 font-mono text-sm text-gray-700">{r.number ?? '—'}</div>
              <div className="col-span-3 min-w-0">
                <div className="font-medium text-gray-900 truncate">{r.advertiser_name ?? '—'}</div>
                <div className="text-xs text-gray-500 truncate">{r.bill_to_email ?? ''}</div>
              </div>
              <div className="col-span-2 text-sm text-gray-900">{formatCents(r.total_cents)}</div>
              <div className="col-span-2 text-sm text-gray-700">
                {r.due_date ? new Date(r.due_date).toLocaleDateString() : '—'}
              </div>
              <div className="col-span-2">
                {isPaid
                  ? <PaidStamp paidAt={r.paid_at} />
                  : isVoid
                    ? <span className="text-xs text-rose-600 font-medium uppercase tracking-wider">Void</span>
                    : <UnpaidBadge overdue={!!r.is_overdue} />}
              </div>
              <div className="col-span-1"><StatusPill value={r.status} options={INV_STATUS} /></div>
              {onDelete && isDraft && (
                <button
                  type="button"
                  title="Delete draft invoice"
                  onClick={(e) => { e.stopPropagation(); onDelete(r); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-600 opacity-0 shadow-sm hover:bg-red-50 group-hover:opacity-100 focus:opacity-100"
                >
                  Delete
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
