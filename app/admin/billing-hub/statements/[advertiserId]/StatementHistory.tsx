'use client';

// Statement send history for one partner, with permanent delete (type the
// history ID to confirm), as on the Get Paid statements page.

import { useState } from 'react';

type Row = { id: string; recipient_email: string; sender_email: string; subject: string; sent_by: string | null; sent_at: string; invoice_count: number; outstanding_cents: number };
const money = (c: number) => `$${(c / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const when = (v: string) => new Date(v).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });

export default function StatementHistory({ advertiserId, initial }: { advertiserId: number; initial: Row[] }) {
  const [rows, setRows] = useState(initial);
  const [err, setErr] = useState('');
  async function del(r: Row) {
    const typed = window.prompt(`Permanent deletion cannot be undone. Type this statement history ID to delete it:\n${r.id}`);
    if (typed !== r.id) { setErr('Not deleted: the typed ID did not match.'); return; }
    const res = await fetch(`/api/admin/advertisers/${advertiserId}/statement-history`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ history_id: r.id, permanent: true, confirmation_id: typed }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) { setErr(j.error ?? 'Could not delete this history record.'); return; }
    setErr(''); setRows((x) => x.filter((y) => y.id !== r.id));
  }
  return (
    <section className="mb-4 overflow-hidden rounded-[10px] bg-white print:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Statement send history</h2>
          <p className="text-xs text-gray-500">{rows.length ? `${rows.length} successful ${rows.length === 1 ? 'delivery' : 'deliveries'}` : 'No statements have been sent yet.'}</p>
        </div>
        {rows[0] && <div className="text-right text-xs text-gray-500">Last sent<div className="font-medium text-gray-900">{when(rows[0].sent_at)}</div></div>}
      </div>
      {err && <p className="px-4 pb-2 text-xs text-red-700">{err}</p>}
      {rows.length > 0 && (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-600"><tr><th className="px-4 py-2 font-semibold">Date</th><th className="px-3 py-2 font-semibold">Recipient</th><th className="px-3 py-2 font-semibold">From</th><th className="px-3 py-2 text-right font-semibold">Invoices</th><th className="px-3 py-2 text-right font-semibold">Balance sent</th><th /></tr></thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-700">{when(e.sent_at)}{e.sent_by && <div className="text-[11px] text-gray-400">by {e.sent_by}</div>}</td>
                  <td className="px-3 py-3 text-gray-700" title={e.subject}>{e.recipient_email}</td>
                  <td className="px-3 py-3 text-gray-600">{e.sender_email}</td>
                  <td className="px-3 py-3 text-right text-gray-700">{e.invoice_count}</td>
                  <td className="px-3 py-3 text-right font-medium text-gray-900">{money(e.outstanding_cents)}</td>
                  <td className="px-3 py-3 text-right"><button type="button" onClick={() => del(e)} style={{ border: 0, background: 'transparent' }} className="text-red-700 underline">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
