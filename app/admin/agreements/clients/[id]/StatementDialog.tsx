'use client';

import { useState } from 'react';
import { A } from '@/components/anchor/ui';
import { day, money, type Adv, type Inv } from '../data';

// Statement summary for the selected issued invoices. Sending creates one
// payment link per invoice plus a Pay Balance in Full link, then emails the
// statement (with a PDF copy) to the client.
export default function StatementDialog({ client, invoices, onClose }: { client: Adv; invoices: Inv[]; onClose: () => void }) {
  const [to, setTo] = useState(client.billing_email || client.contact_email || '');
  const [message, setMessage] = useState(`Dear ${client.name},\n\nHere is your statement of account. You can pay each invoice individually, or use Pay Balance in Full to settle everything at once.`);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const total = invoices.reduce((n, i) => n + Math.max(i.balance_cents, 0), 0);

  // Beta: statements are not emailed to clients, so there is no send action.
  void setBusy; void busy; void message;

  return (
    <div role="dialog" aria-modal="true" aria-label="Statement summary" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[12px] bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Statement summary</h2>
        <p className="mt-1 text-sm text-[color:var(--ds-body)]">{client.name}</p>
        <table className={`${A.table} mt-4`}>
          <thead><tr><th>Invoice</th><th>Due</th><th className="text-right">Total</th><th className="text-right">Balance</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id}><td className="font-medium text-[color:var(--ds-ink)]">{i.number ?? '—'}</td><td className="whitespace-nowrap">{day(i.due_date)}</td><td className="text-right">{money(i.total_cents)}</td><td className="text-right">{money(i.balance_cents)}</td></tr>
            ))}
          </tbody>
        </table>
        <div className="mt-3 flex items-center justify-between rounded-[10px] bg-[color:var(--ds-page,#f6f6fa)] px-4 py-3 text-sm">
          <span className="font-medium text-[color:var(--ds-ink)]">Balance in full</span>
          <span className="text-base font-semibold text-[color:var(--ds-ink)]">{money(total)}</span>
        </div>
        <p className="mt-2 text-xs text-[color:var(--ds-body)]">Each invoice gets its own payment link, plus a Pay Balance in Full link for {money(total)}. Paying one invoice expires the Pay Balance in Full link, so you can resend an updated statement.</p>
        <label className="mt-4 block text-xs text-[color:var(--ds-body)]">Send to
          <input className={`${A.input} mt-1`} type="email" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className="mt-3 block text-xs text-[color:var(--ds-body)]">Message
          <textarea className={`${A.input} mt-1 min-h-[96px]`} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        {result && <p className={`mt-3 text-sm ${result.ok ? 'text-[#065F46]' : 'text-red-700'}`}>{result.text}</p>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className={A.outline} onClick={onClose}>{result?.ok ? 'Close' : 'Cancel'}</button>
          {!result?.ok && <button type="button" className={A.primary} disabled>Send statement (off in beta)</button>}
        </div>
      </div>
    </div>
  );
}
