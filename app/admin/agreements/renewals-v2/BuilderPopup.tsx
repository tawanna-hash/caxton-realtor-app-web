'use client';

// Pop-up hosts for the agreement builder: create a template, use a template.
// The builder runs inside the pop-up and asks it to close with a postMessage.

import { useEffect, useState } from 'react';
import { A } from '@/components/anchor/ui';

export function BuilderPopup({ query, title, onClose }: { query: string; title: string; onClose: (to?: string) => void }) {
  useEffect(() => {
    const h = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'builder-close') return;
      onClose(typeof e.data.to === 'string' ? e.data.to : undefined);
    };
    window.addEventListener('message', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('message', h); document.body.style.overflow = prev; };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="flex h-full max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-[10px] bg-white shadow-xl">
        <iframe title={title} src={`/admin/agreements/renewals-v2/new?embed=1${query}`} className="h-full w-full border-0" />
      </div>
    </div>
  );
}

type Tpl = { id: string; name: string; updated_at: string };

/** Pick a saved template, then open the builder pre-filled in the pop-up. */
export function UseTemplatePicker({ onClose, onPick }: { onClose: () => void; onPick: (id: string) => void }) {
  const [rows, setRows] = useState<Tpl[] | null>(null);
  useEffect(() => {
    fetch('/api/admin/agreements-v2/builder', { credentials: 'include' }).then((r) => r.json()).then((j) => setRows((j.templates ?? []) as Tpl[])).catch(() => setRows([]));
  }, []);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Use a template">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[10px] bg-white shadow-xl">
        <div className="relative bg-[color:var(--ds-selected)] px-4 py-5 text-center sm:px-6">
          <h2 className="text-lg font-semibold text-[color:var(--ds-ink)]">Use a template</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="absolute right-4 top-4 text-xl leading-none text-[color:var(--ds-ink)]" style={{ border: 0, background: 'transparent' }}>×</button>
        </div>
        <div className="space-y-2 px-4 py-5 sm:px-6">
          {rows === null && <p className="text-sm text-[color:var(--ds-body)]">Loading…</p>}
          {rows !== null && rows.length === 0 && <p className="text-sm text-[color:var(--ds-body)]">No templates yet. Create one from the Templates page.</p>}
          {(rows ?? []).map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 rounded-[10px] bg-[color:var(--ds-page)] px-4 py-3">
              <span className="text-sm font-medium text-[color:var(--ds-ink)]">{t.name}</span>
              <button type="button" className={A.small} onClick={() => onPick(t.id)}>Use template</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
