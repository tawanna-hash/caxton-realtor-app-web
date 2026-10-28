'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { BETA_EMAIL_ENABLED } from '@/lib/beta-email';

export default function SendStatementButton({ advertiserId, to }: { advertiserId: number; to: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function send() {
    if (!window.confirm(`Email this statement${to ? ` to ${to}` : ' to the partner'}?`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch(`/api/admin/advertisers/${advertiserId}/send-statement`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'all', ...(to ? { to } : {}) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      setMsg('Statement sent.'); router.refresh();
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not send.'); } finally { setBusy(false); }
  }
  return (
    <>
      {msg && <span className="text-xs text-gray-500">{msg}</span>}
      <button type="button" disabled={!BETA_EMAIL_ENABLED || busy} onClick={send} className="rounded-md bg-[color:var(--ds-primary)] px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Sending…' : 'Send statement'}</button>
    </>
  );
}
