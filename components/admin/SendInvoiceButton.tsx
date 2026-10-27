'use client';

import { useState } from 'react';

export default function SendInvoiceButton({ invoiceId, status, email }: { invoiceId: string; status: string; email: string | null }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const blocked = status === 'void' || status === 'paid';
  const send = async () => {
    const to = window.prompt('Send this invoice to:', email ?? '');
    if (to === null) return;
    setBusy(true); setNote(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/payment-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_email: true, email_mode: 'invoice', email_to: to.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'Could not send invoice.');
      if (data.email_status !== 'sent') throw new Error(data.email_error ?? `Email ${data.email_status ?? 'not sent'}.`);
      setNote(`Sent to ${to.trim() || email}.`);
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not send invoice.');
    } finally { setBusy(false); }
  };
  return (
    <span className="inline-flex items-center gap-2 print:hidden">
      {note && <span className="text-xs text-gray-600">{note}</span>}
      <button
        type="button"
        disabled={busy || blocked}
        title={blocked ? `This invoice is ${status}.` : undefined}
        onClick={send}
        className="min-h-11 rounded-md bg-[#1f1a4d] px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Sending…' : 'Send Invoice'}
      </button>
    </span>
  );
}
