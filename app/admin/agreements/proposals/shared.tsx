'use client';

// Pieces shared by the Agreements pages.

import { useEffect, useRef, useState } from 'react';
import { A } from '@/components/anchor/ui';

export const NEW_PROPOSAL = '/admin/agreements/renewals-v2/new';
export const TEMPLATES = '/admin/agreements/proposals/templates';

export function relTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function stamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Split button: Create agreement, with a menu for starting from a template. */
export function CreateProposal({ label = 'Create agreement' }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative inline-flex">
      <a href={NEW_PROPOSAL} className={A.primary} style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}>{label}</a>
      <button type="button" aria-label="More ways to create an agreement" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${A.primary} px-3`} style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0, marginLeft: 1 }}>
        <span aria-hidden="true" className="inline-block text-[10px] leading-none">&#9660;</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1.5 w-56 rounded-[14px] border border-[color:var(--ds-line)] bg-white p-1 shadow-lg">
          <a role="menuitem" href={NEW_PROPOSAL} className="block rounded-[10px] px-3 py-2 text-sm text-[color:var(--ds-ink)] hover:bg-[color:var(--ds-hover)]">Blank agreement</a>
          <a role="menuitem" href={TEMPLATES} className="block rounded-[10px] px-3 py-2 text-sm text-[color:var(--ds-ink)] hover:bg-[color:var(--ds-hover)]">From a template</a>
        </div>
      )}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold text-[color:var(--ds-ink)]">{title}</h2>
        {subtitle && <p className={A.subtitle}>{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3">{children}</div>
    </div>
  );
}

function Doc({ tag }: { tag: string }) {
  return (
    <svg width="220" height="150" viewBox="0 0 220 150" fill="none" aria-hidden="true">
      <ellipse cx="110" cy="75" rx="100" ry="62" fill="url(#g)" opacity="0.5" />
      <rect x="70" y="14" width="86" height="112" rx="10" fill="#fff" stroke="#D8D2F0" />
      <rect x="82" y="34" width="46" height="6" rx="3" fill="#582BE7" />
      <rect x="82" y="48" width="58" height="6" rx="3" fill="#582BE7" />
      <rect x="82" y="62" width="36" height="6" rx="3" fill="#582BE7" />
      <rect x="40" y="82" width="78" height="26" rx="5" fill="#B9B3F7" />
      <text x="48" y="99" fontSize="11" fill="#fff">{tag}</text>
      <defs><radialGradient id="g"><stop stopColor="#DAD2FA" /><stop offset="1" stopColor="#F3F4F7" stopOpacity="0" /></radialGradient></defs>
    </svg>
  );
}

export function EmptyPanel({ tag, title, body, cta = true }: { tag: string; title: string; body: string; cta?: boolean }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <Doc tag={tag} />
      <h2 className="mt-6 text-lg font-semibold text-[color:var(--ds-ink)]">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-[color:var(--ds-body)]">{body}</p>
      {cta && <div className="mt-6"><CreateProposal label="Create an agreement" /></div>}
    </div>
  );
}

export const checkbox = 'h-5 w-5 rounded-[6px] accent-[color:var(--ds-primary)]';
