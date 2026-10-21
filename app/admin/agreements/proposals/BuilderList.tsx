'use client';

// One list for the three kinds of saved builder documents: drafts, archived
// drafts and templates. Same table, search, checkboxes, row menu and bulk menu.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { A, RowMenu, SearchBox, type MenuItem } from '@/components/anchor/ui';
import { CreateProposal, EmptyPanel, NEW_PROPOSAL, PageHeader, checkbox, relTime, stamp } from './shared';
import SortCaret from '@/components/anchor/SortCaret';

type Row = { id: string; name: string; updated_at: string };
export type ListKind = 'draft' | 'archived' | 'template';

const CFG = {
  draft: { title: 'Drafts', nameCol: 'Client name', dateCol: 'Last modified', key: 'drafts', sub: 'Agreement' },
  archived: { title: 'Archived agreements', nameCol: 'Client name', dateCol: 'Archived on', key: 'archived', sub: 'Agreement' },
  template: { title: 'Agreement templates', nameCol: 'Template name', dateCol: 'Last updated on', key: 'templates', sub: '' },
} as const;

function BulkMenu({ items, disabled }: { items: MenuItem[]; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const f = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${A.outline} gap-2`}>
        Bulk actions
        <span aria-hidden="true" className="inline-block text-[10px] leading-none">&#9660;</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-1.5 w-48 rounded-[14px] border border-[color:var(--ds-line)] bg-white p-1 shadow-lg">
          {items.map((i) => (
            <button key={i.label} type="button" role="menuitem" style={{ border: 0, background: 'transparent' }} className={`block w-full rounded-[10px] px-3 py-2 text-left text-sm hover:bg-[color:var(--ds-hover)] ${i.danger ? 'text-red-700' : 'text-[color:var(--ds-ink)]'}`} onClick={() => { setOpen(false); i.onClick?.(); }}>{i.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BuilderList({ kind }: { kind: ListKind }) {
  const cfg = CFG[kind];
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>([]);
  const [desc, setDesc] = useState(true);
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/admin/agreements-v2/builder', { credentials: 'include' })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`); if (alive) setRows((j[cfg.key] ?? []) as Row[]); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Could not load.'); });
    return () => { alive = false; };
  }, [tick, cfg.key]);

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => !n || r.name.toLowerCase().includes(n));
    return [...list].sort((a, b) => (desc ? -1 : 1) * (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()));
  }, [rows, q, desc]);

  async function act(action: 'archive' | 'restore' | 'duplicate' | 'delete', ids: string[]) {
    if (action === 'delete' && !window.confirm(`Delete ${ids.length === 1 ? 'this item' : `these ${ids.length} items`}? This cannot be undone.`)) return;
    setNotice(null);
    try {
      for (const id of ids) {
        const res = await fetch('/api/admin/agreements-v2/builder', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, id }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      }
      setSel([]);
      setNotice(action === 'archive' ? 'Moved to Archived.' : action === 'restore' ? 'Moved back to Drafts.' : action === 'duplicate' ? 'Copy created.' : 'Deleted.');
      reload();
    } catch (e) { setNotice(`Could not complete that: ${e instanceof Error ? e.message : 'error'}`); }
  }

  const editHref = (id: string) => `${NEW_PROPOSAL}?${kind === 'template' ? 'template' : 'draft'}=${id}`;
  const rowItems = (r: Row): MenuItem[] =>
    kind === 'draft' ? [{ label: 'Duplicate', onClick: () => act('duplicate', [r.id]) }, { label: 'Archive', onClick: () => act('archive', [r.id]) }, { label: 'Delete', danger: true, onClick: () => act('delete', [r.id]) }]
    : kind === 'archived' ? [{ label: 'Restore', onClick: () => act('restore', [r.id]) }, { label: 'Delete', danger: true, onClick: () => act('delete', [r.id]) }]
    : [{ label: 'Duplicate', onClick: () => act('duplicate', [r.id]) }, { label: 'Delete', danger: true, onClick: () => act('delete', [r.id]) }];
  const bulkItems: MenuItem[] =
    kind === 'draft' ? [{ label: 'Archive', onClick: () => act('archive', sel) }, { label: 'Delete', danger: true, onClick: () => act('delete', sel) }]
    : kind === 'archived' ? [{ label: 'Restore', onClick: () => act('restore', sel) }, { label: 'Delete', danger: true, onClick: () => act('delete', sel) }]
    : [{ label: 'Delete', danger: true, onClick: () => act('delete', sel) }];

  const allOn = shown.length > 0 && shown.every((r) => sel.includes(r.id));
  const empty = rows !== null && rows.length === 0;

  return (
    <div className="space-y-5">
      <PageHeader title={cfg.title}>
        {kind === 'template' ? <a href={NEW_PROPOSAL} className={A.primary}>Create template</a> : !empty || kind === 'draft' ? <CreateProposal /> : null}
      </PageHeader>
      {notice && <div className={A.notice}>{notice}</div>}
      {error && <div className={A.error}>{error}</div>}
      {rows === null && !error && <p className="text-sm text-[color:var(--ds-body)]">Loading…</p>}
      {empty && kind === 'archived' && <EmptyPanel tag="Archived" title="No archived agreements yet" body="When you archive an agreement, it stays here for reference." />}
      {empty && kind === 'draft' && <EmptyPanel tag="Draft" title="No drafts yet" body="Agreements you start and leave unfinished are saved here automatically." />}
      {empty && kind === 'template' && <EmptyPanel tag="Template" title="No templates yet" body="Build an agreement, then choose Save as template to reuse it." />}
      {rows !== null && rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SearchBox value={q} onChange={setQ} label={`Search ${cfg.title.toLowerCase()}`} />
            <BulkMenu items={bulkItems} disabled={sel.length === 0} />
          </div>
          <div className="overflow-x-auto">
            <table className={`${A.table} min-w-[560px]`}>
              <thead>
                <tr>
                  <th className="w-10"><input type="checkbox" className={checkbox} aria-label="Select all" checked={allOn} onChange={() => setSel(allOn ? [] : shown.map((r) => r.id))} /></th>
                  <th>{cfg.nameCol}</th>
                  <th><button type="button" onClick={() => setDesc((d) => !d)} style={{ border: 0, background: 'transparent', padding: 0 }} className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--ds-body)]" aria-label={`Sort by ${cfg.dateCol}`}>{cfg.dateCol}<SortCaret dir={desc ? 'desc' : 'asc'} /></button></th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td><input type="checkbox" className={checkbox} aria-label={`Select ${r.name || 'item'}`} checked={sel.includes(r.id)} onChange={() => setSel((s) => (s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id]))} /></td>
                    <td>
                      <div className="font-medium text-[color:var(--ds-ink)]">{r.name || '—'}</div>
                      {cfg.sub && <div className="text-xs text-[color:var(--ds-body)]">{cfg.sub}</div>}
                    </td>
                    <td className="whitespace-nowrap text-[color:var(--ds-ink)]">{kind === 'draft' ? relTime(r.updated_at) : stamp(r.updated_at)}</td>
                    <td className="whitespace-nowrap text-right">
                      <span className="inline-flex items-center gap-2">
                        {kind !== 'archived' && <a href={editHref(r.id)} className={A.small}>{kind === 'template' ? 'Use template' : 'Edit'}</a>}
                        <RowMenu items={rowItems(r)} />
                      </span>
                    </td>
                  </tr>
                ))}
                {shown.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-[color:var(--ds-body)]">Nothing matches your search.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
