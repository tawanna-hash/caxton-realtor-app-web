'use client';

// components/admin/AdminGlobalSearch.tsx
//
// Pill-shaped global search for the admin top bar (Mint UI kit pattern).
// Searches two things:
//   1. Admin pages from lib/admin-nav.ts (instant, client-side)
//   2. Partners (advertisers), loaded once from the picker endpoint on first
//      focus and filtered client-side. Choosing a partner opens the CRM with
//      that name pre-filled in the Partners search.
// Keyboard: "/" focuses, arrows move, Enter opens, Esc closes.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, FileText, Building2 } from 'lucide-react';
import { ADMIN_NAV } from '@/lib/admin-nav';

type Partner = { id: number; name: string; publication?: string };
type Result = { key: string; kind: 'page' | 'partner'; label: string; hint: string; href: string };

const MAX_PAGES = 6;
const MAX_PARTNERS = 6;

export default function AdminGlobalSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [partners, setPartners] = useState<Partner[] | null>(null);
  const loadingRef = useRef(false);

  const pages = useMemo(
    () =>
      ADMIN_NAV.flatMap((g) =>
        g.links.map((l) => ({
          label: l.label,
          group: g.label,
          href: l.href,
          description: l.description ?? '',
        })),
      ),
    [],
  );

  function loadPartners() {
    if (partners || loadingRef.current) return;
    loadingRef.current = true;
    fetch('/api/admin/advertisers/picker', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { advertisers: [] }))
      .then((d: { advertisers?: Partner[] }) => setPartners(d.advertisers ?? []))
      .catch(() => setPartners([]))
      .finally(() => {
        loadingRef.current = false;
      });
  }

  const results: Result[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const pageHits: Result[] = pages
      .filter((p) => `${p.label} ${p.group} ${p.description}`.toLowerCase().includes(term))
      .slice(0, MAX_PAGES)
      .map((p) => ({ key: `p:${p.href}`, kind: 'page', label: p.label, hint: p.group, href: p.href }));
    const partnerHits: Result[] = (partners ?? [])
      .filter((a) => a.name.toLowerCase().includes(term))
      .slice(0, MAX_PARTNERS)
      .map((a) => ({
        key: `a:${a.id}`,
        kind: 'partner',
        label: a.name,
        hint: 'Partner',
        href: `/admin/crm?q=${encodeURIComponent(a.name)}`,
      }));
    return [...pageHits, ...partnerHits];
  }, [q, pages, partners]);

  // "/" focuses the search unless the user is typing in a field already.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function go(r: Result | undefined) {
    if (!r) return;
    setOpen(false);
    setQ('');
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  const showPanel = open && q.trim().length > 0;

  return (
    <div ref={boxRef} className="relative w-full" role="search">
      <Search size={16} aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-500" />
      <input
        ref={inputRef}
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          loadPartners();
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder="Search anything here..."
        aria-label="Search admin pages and partners"
        autoComplete="off"
        className="h-10 w-full rounded-full border border-[#E3DDF0] bg-white pl-4 pr-10 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-brand-700 focus:ring-2 focus:ring-brand-700/15"
      />
      {showPanel && (
        <div className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-2xl border border-[#ECE8F5] bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-500">
              {partners === null ? 'Searching...' : 'No matching pages or partners'}
            </div>
          ) : (
            <ul role="listbox" className="max-h-96 overflow-y-auto py-1">
              {results.map((r, i) => (
                <li key={r.key} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={`flex w-full items-center gap-3 px-4 py-2 text-left text-sm ${
                      i === active ? 'bg-brand-50 text-brand-700' : 'text-gray-800'
                    }`}
                  >
                    {r.kind === 'page' ? <FileText size={16} className="shrink-0" /> : <Building2 size={16} className="shrink-0" />}
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                    <span className="shrink-0 text-xs text-gray-500">{r.hint}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
