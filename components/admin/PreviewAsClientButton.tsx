'use client';

import { useState } from 'react';

/** Opens the client portal page for this invoice in a read-only admin preview. */
export default function PreviewAsClientButton({ advertiserId, invoiceId }: { advertiserId: number | null; invoiceId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!advertiserId) return null;
  async function go() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/admin/portal-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ advertiser_id: advertiserId, invoice_id: invoiceId }) });
      const j = await r.json();
      if (!r.ok || !j.url) throw new Error(j.error ?? 'Could not start the preview.');
      window.location.href = j.url;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not start the preview.');
      setBusy(false);
    }
  }
  return (
    <span className="inline-flex items-center gap-2 print:hidden">
      {err && <span className="text-xs text-red-700">{err}</span>}
      <button type="button" onClick={go} disabled={busy} className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-sm hover:bg-gray-50 disabled:opacity-50">
        {busy ? 'Opening…' : 'Preview as client'}
      </button>
    </span>
  );
}
