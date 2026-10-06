'use client';

import { useCallback, useEffect, useState } from 'react';
import type { AgentDeal } from '@/lib/agent-command-center-workspace';

const btn = 'inline-flex items-center rounded-lg border border-[#E6E5EC] bg-white px-3 py-1.5 text-[13px] font-medium text-[#1B1726] transition hover:border-[#301D5D] hover:bg-[#301D5D] hover:text-white disabled:opacity-45';

export default function ClientPortalPanel({ deal }: { deal: AgentDeal }) {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/closing-time/assist?dealId=${encodeURIComponent(deal.id)}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) { setError(body.error ?? 'Not available yet. Wait for the deal to finish saving.'); return; }
      setToken(body.portalToken ?? null); setError('');
    } catch { setError('Could not load the client portal.'); }
  }, [deal.id]);
  useEffect(() => { void load(); }, [load]);

  const act = async (extra: Record<string, unknown>) => {
    setBusy(true); setError('');
    try {
      const res = await fetch('/api/closing-time/assist', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'portal', dealId: deal.id, ...extra }) });
      if (!res.ok) setError((await res.json()).error ?? 'Something went wrong.');
      await load();
    } catch { setError('Something went wrong.'); }
    setBusy(false);
  };

  const url = token ? `${window.location.origin}/deal-portal/${token}` : '';
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-[22px] font-semibold text-[#1B1726]">Client Portal</h2>
        <p className="mt-1 text-[14px] text-[#4A4757]">One private link for everyone on this deal. No sign-in needed.</p>
      </div>
      <section className="rounded-[10px] border border-[#E6E5EC] bg-white p-4">
        <h3 className="text-[14px] font-semibold text-[#1B1726]">Shared Link</h3>
        {token === undefined && !error && <p className="mt-2 text-[12px] font-medium text-[#7A7787]">Loading</p>}
        {token === null && (
          <div className="mt-3">
            <p className="mb-3 text-[14px] text-[#4A4757]">No link yet. Create one to share this deal with your clients.</p>
            <button type="button" disabled={busy} className={btn} onClick={() => void act({})}>Create Link</button>
          </div>
        )}
        {token && (
          <div className="mt-3 space-y-3">
            <input readOnly value={url} aria-label="Client portal link" onFocus={(e) => e.currentTarget.select()} className="w-full rounded-lg border border-[#E6E5EC] bg-white px-3 py-2 text-[14px] font-medium text-[#1B1726]" />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn} onClick={() => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied' : 'Copy Link'}</button>
              <a className={btn} href={url} target="_blank" rel="noreferrer">Preview</a>
              <button type="button" disabled={busy} className={btn} onClick={() => { if (window.confirm('Reset the link? The old link will stop working.')) void act({ reset: true }); }}>Reset Link</button>
              <button type="button" disabled={busy} className={btn} onClick={() => { if (window.confirm('Turn off the link? Clients will no longer be able to open it.')) void act({ disable: true }); }}>Turn Off</button>
            </div>
          </div>
        )}
        {error && <p role="alert" className="mt-3 text-[12px] font-medium text-[#9A3D2B]">{error}</p>}
      </section>
      <section className="rounded-[10px] border border-[#E6E5EC] bg-[#F6F3FB] p-4">
        <h3 className="text-[14px] font-semibold text-[#1B1726]">What Clients See</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] text-[#4A4757]">
          <li>Days to closing, stage tracker, next deadline and all deadlines</li>
          <li>View-only copies of the required forms on this deal</li>
          <li>Requested documents, with upload buttons</li>
          <li>Never your notes, activity or internal checklists</li>
        </ul>
      </section>
    </div>
  );
}
