'use client';

// Review-and-send dialog for invoice emails and payment reminders (Billing > Invoices).
import { useState } from 'react';
import { A } from '@/components/anchor/ui';
import type { InvoiceWithAdvertiser } from '@/lib/invoices';
import { formatCents, outstandingCents } from '@/lib/invoices';

export type EmailSender = 'auto' | 'tawanna@myrealtyline.com' | 'tawanna@newslinesa.com' | 'hello@myrealtyline.com' | 'hello@newslinesa.com';
export type EmailValues = { from: EmailSender; to: string; subject: string; message: string };

const FIELD = 'mt-1 w-full rounded-[10px] border border-[color:var(--ds-line)] bg-white px-3 py-2 text-sm text-[color:var(--ds-ink)]';

export default function EmailInvoiceDialog({ invoice, reminder, daysOver, busy, onClose, onSend }: {
  invoice: InvoiceWithAdvertiser; reminder: boolean; daysOver: number; busy: boolean; onClose: () => void; onSend: (v: EmailValues) => void;
}) {
  const client = invoice.bill_to_name ?? invoice.advertiser_name ?? 'Customer';
  const [from, setFrom] = useState<EmailSender>('auto');
  const [to, setTo] = useState(invoice.bill_to_email ?? '');
  const [subject, setSubject] = useState(reminder ? 'Reminder: Your payment to Caxton Publications Inc. is due' : `Invoice ${invoice.number ?? ''} from Caxton Publications, Inc.`);
  const [body, setBody] = useState(reminder
    ? `Dear ${client},\n\nThis is a reminder that invoice ${invoice.number ?? ''} has not been paid. If you have any questions, please reach out to our office.\n\nSincerely,\nTawanna Verock\nCaxton Publications Inc.`
    : `Dear ${client},\n\nWe appreciate your business. Please find your invoice details here. Feel free to contact us if you have any questions.\n\nSincerely,\nTawanna Verock\nCaxton Publications Inc.`);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-label={reminder ? 'Review invoice reminder' : `Send invoice ${invoice.number}`}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[14px] bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-[color:var(--ds-line)] px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">{reminder ? 'Review invoice reminder' : `Send invoice ${invoice.number ?? ''}`}</h2>
            <p className="mt-1 text-xs text-[color:var(--ds-body)]">{reminder ? 'Review and edit the reminder before sending.' : 'Review the email before sending. A secure payment link is included.'}</p>
          </div>
          <button type="button" aria-label="Close email" className="px-2 text-lg" style={{ background: 'transparent', border: 0 }} onClick={onClose}>×</button>
        </header>
        <div className="grid gap-6 p-6 md:grid-cols-[1fr_220px]">
          <div className="space-y-3">
            <label className="block text-xs font-medium text-[color:var(--ds-body)]">From
              <select className={FIELD} value={from} onChange={(e) => setFrom(e.target.value as EmailSender)}>
                <option value="auto">Match partner&rsquo;s publication (recommended)</option>
                <option value="tawanna@myrealtyline.com">Tawanna Verock &lt;tawanna@myrealtyline.com&gt;</option>
                <option value="tawanna@newslinesa.com">Tawanna Verock &lt;tawanna@newslinesa.com&gt;</option>
                <option value="hello@myrealtyline.com">Caxton Publications Inc. &lt;hello@myrealtyline.com&gt;</option>
                <option value="hello@newslinesa.com">Caxton Publications Inc. &lt;hello@newslinesa.com&gt;</option>
              </select>
            </label>
            <label className="block text-xs font-medium text-[color:var(--ds-body)]">To<input className={FIELD} type="email" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            <label className="block text-xs font-medium text-[color:var(--ds-body)]">Subject<input className={FIELD} value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
            <label className="block text-xs font-medium text-[color:var(--ds-body)]">Message
              <textarea className={`${FIELD} min-h-48 rounded-[14px] px-4 py-3 leading-6`} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
          </div>
          <aside className="h-fit rounded-[12px] bg-[color:var(--ds-page)] p-4 text-xs text-[color:var(--ds-body)]">
            <div className="font-semibold text-[color:var(--ds-ink)]">{client}</div>
            <div className="mt-3">Total {formatCents(invoice.total_cents)}</div>
            <div className="mt-1">Balance due {formatCents(outstandingCents(invoice))}</div>
            <div className="mt-1">{invoice.is_overdue ? `${daysOver} days overdue` : 'Open invoice'}</div>
          </aside>
        </div>
        <footer className="flex items-center justify-between border-t border-[color:var(--ds-line)] px-6 py-4">
          <button type="button" className={A.outline} onClick={onClose}>Cancel</button>
          <button type="button" className={A.primary} disabled={busy || !to.trim() || !subject.trim()} onClick={() => onSend({ from, to, subject, message: body })}>{busy ? 'Sending…' : reminder ? 'Send reminder' : 'Send invoice'}</button>
        </footer>
      </div>
    </div>
  );
}
