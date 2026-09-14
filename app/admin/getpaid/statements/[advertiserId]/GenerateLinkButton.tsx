'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function GenerateLinkButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/payment-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_email: false }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? 'failed');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="print:hidden">
      <button
        type="button"
        onClick={generate}
        disabled={busy}
        className="font-semibold text-blue-700 underline disabled:opacity-50"
      >
        {busy ? 'Generating…' : 'Generate link'}
      </button>
      {error && <div className="text-[9px] text-red-600">{error}</div>}
    </div>
  );
}
