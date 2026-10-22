'use client';

// Client file card: every Payment Method Setup request sent to this client
// (with a copy of the email) and the client's setup outcomes.

import { useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';

type Entry = {
  id: string; event: 'request_sent' | 'method_saved' | 'bank_pending' | 'setup_failed'; created_at: string;
  actor: string | null; market: string | null; from_email: string | null; to_emails: string[] | null; cc_emails: string[] | null;
  subject: string | null; has_copy: boolean; setup_url: string | null; link_expires_at: string | null;
  method_label: string | null; method_last4: string | null; details: string | null;
};

const TITLE: Record<Entry['event'], string> = {
  request_sent: 'Setup request sent',
  method_saved: 'Payment method saved',
  bank_pending: 'Bank verification pending',
  setup_failed: 'Setup failed',
};
const TONE: Record<Entry['event'], string> = {
  request_sent: 'border-[color:var(--ds-line)] text-[color:var(--ds-body)]',
  method_saved: 'border-[#047857] bg-[#E6F6EF] text-[#065F46]',
  bank_pending: 'border-[#B45309] bg-[#FEF3C7] text-[#92400E]',
  setup_failed: 'border-[#C8102E] bg-[#FDECEF] text-[#9B0C23]',
};
const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export default function PaymentSetupHistory({ id, ids }: { id: number; ids: number[] }) {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [view, setView] = useState<{ subject: string; html: string; meta: string } | null>(null);
  const idsKey = ids.join(',');

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/advertisers/${id}/payment-setup-history?ids=${idsKey}`, { credentials: 'include', cache: 'no-store' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? 'Could not load.'); if (alive) setRows(j.entries ?? []); })
      .catch((e) => { if (alive) { setRows([]); setErr(e instanceof Error ? e.message : 'Could not load.'); } });
    return () => { alive = false; };
  }, [id, idsKey]);

  async function open(e: Entry) {
    const r = await fetch(`/api/admin/advertisers/${id}/payment-setup-history?ids=${idsKey}&entry=${e.id}`, { credentials: 'include', cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.entry?.html) { setErr('Could not open the email copy.'); return; }
    const to = [...(j.entry.to_emails ?? []), ...(j.entry.cc_emails ?? []).map((c: string) => `${c} (cc)`)].join(', ');
    setView({ subject: j.entry.subject ?? '', html: j.entry.html, meta: `From ${j.entry.from_email ?? ''} · To ${to} · ${when(j.entry.created_at)}` });
  }

  return (
    <section className={`${A.card} p-5 sm:p-5`}>
      <h3 className="mb-3 text-base font-semibold text-[color:var(--ds-ink)]">Payment setup history</h3>
      {err && <p className="mb-2 text-xs text-red-700">{err}</p>}
      {rows === null ? <p className="text-sm text-[color:var(--ds-body)]">Loading…</p>
        : rows.length === 0 ? <p className="text-sm text-[color:var(--ds-body)]">No payment setup requests have been sent.</p>
        : (
          <ul className="space-y-2">
            {rows.map((e) => (
              <li key={e.id} className="rounded-[10px] border border-[color:var(--ds-line)] p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${TONE[e.event]}`}>{TITLE[e.event]}</span>
                  <span className="text-xs text-[color:var(--ds-body)]">{when(e.created_at)}</span>
                </div>
                {e.event === 'request_sent' ? (
                  <div className="mt-2 space-y-0.5 text-xs text-[color:var(--ds-body)]">
                    <p>To: <span className="text-[color:var(--ds-ink)]">{(e.to_emails ?? []).join(', ')}</span></p>
                    {(e.cc_emails ?? []).length > 0 && <p>CC: <span className="text-[color:var(--ds-ink)]">{(e.cc_emails ?? []).join(', ')}</span></p>}
                    <p>From {e.from_email}{e.actor ? ` · sent by ${e.actor}` : ''}</p>
                    {e.link_expires_at && <p>Link valid until {new Date(e.link_expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                    {e.has_copy && <button type="button" onClick={() => open(e)} style={{ border: 0, background: 'transparent', padding: 0 }} className="mt-1 text-sm font-medium text-[color:var(--ds-primary)] hover:underline">View email</button>}
                  </div>
                ) : (
                  <div className="mt-2 space-y-0.5 text-xs text-[color:var(--ds-body)]">
                    {e.method_label && <p className="text-[color:var(--ds-ink)]">{e.method_label}{e.method_last4 ? ` ending in ${e.method_last4}` : ''}</p>}
                    {e.details && <p>{e.details}</p>}
                    {e.actor && <p>By {e.actor}</p>}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

      {view && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label="Sent email" onClick={() => setView(null)}>
          <div className="w-full max-w-2xl space-y-3 rounded-[12px] bg-white p-5" onClick={(ev) => ev.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-[color:var(--ds-ink)]">{view.subject}</h2>
                <p className="text-xs text-[color:var(--ds-body)]">{view.meta}</p>
              </div>
              <button type="button" className={A.small} onClick={() => setView(null)}>Close</button>
            </div>
            <iframe title="Sent email" srcDoc={view.html} sandbox="" className="h-[520px] w-full rounded-[10px] border border-[color:var(--ds-line)] bg-white" />
          </div>
        </div>
      )}
    </section>
  );
}
