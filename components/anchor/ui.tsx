'use client';

// components/anchor/ui.tsx
//
// Shared building blocks for the Agreements (Beta) workspace, matched to the
// Anchor app's layout: plain page title, outlined pill filters with checkbox
// popovers and Apply, rounded-rectangle buttons, gray table header with white
// row cards, label-left settings rows. Realty News Now logo and navigation stay.

import { useEffect, useRef, useState } from 'react';

export const ANCHOR = {
  primary: '#582BE7',
  primaryHover: '#4B1FB8',
  navy: '#16132D',
  muted: '#4E4B66',
  line: '#E2DFEC',
  tint: '#EEE8FD',
  headBg: '#F3F4F7',
} as const;

export const A = {
  title: 'text-[22px] font-semibold leading-tight tracking-[-0.02em] text-[color:var(--ds-ink)]',
  subtitle: 'text-sm text-[color:var(--ds-body)]',
  primary: 'min-h-9 anchor-primary inline-flex items-center justify-center rounded-[10px] bg-[color:var(--ds-primary)] px-5 py-2.5 text-sm font-medium text-white hover:bg-[color:var(--ds-primary-press)] disabled:cursor-not-allowed disabled:opacity-50',
  outline: 'min-h-9 anchor-outline inline-flex items-center justify-center rounded-[10px] border border-[color:var(--ds-primary)] bg-white px-4 py-2 text-sm font-medium text-[color:var(--ds-primary)] hover:bg-[color:var(--ds-hover)] disabled:cursor-not-allowed disabled:opacity-50',
  small: 'min-h-9 anchor-outline inline-flex items-center justify-center rounded-[10px] border border-[color:var(--ds-primary)] bg-white px-3 py-1.5 text-xs font-medium text-[color:var(--ds-primary)] hover:bg-[color:var(--ds-hover)] disabled:cursor-not-allowed disabled:opacity-50',
  input: 'min-h-9 anchor-input w-full rounded-[10px] border border-[color:var(--ds-line)] bg-white px-3 py-2.5 text-sm text-[color:var(--ds-ink)] placeholder:text-[color:var(--ds-placeholder)] focus:border-[color:var(--ds-primary)] focus:outline-none',
  card: 'rounded-[10px] bg-white',
  // White row cards on a tinted page, gray header row.
  table: 'w-full border-separate text-left text-sm [border-spacing:0_6px] [&_thead_th]:bg-[color:var(--ds-page)] [&_thead_th]:px-3 [&_thead_th]:py-2.5 [&_thead_th]:text-xs [&_thead_th]:font-medium [&_thead_th]:text-[color:var(--ds-body)] [&_thead_th:first-child]:rounded-l-[10px] [&_thead_th:last-child]:rounded-r-[10px] [&_tbody_td]:bg-white [&_tbody_td]:px-3 [&_tbody_td]:py-3.5 [&_tbody_td:first-child]:rounded-l-[10px] [&_tbody_td:last-child]:rounded-r-[10px]',
  notice: 'rounded-[10px] border border-[color:var(--ds-line)] bg-[color:var(--ds-selected)] px-4 py-2 text-sm text-[color:var(--ds-ink)]',
  error: 'rounded-[10px] border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700',
} as const;

function Chevron({ up }: { up?: boolean }) {
  return (
    <span aria-hidden="true" className={`inline-block text-[10px] leading-none ${up ? 'rotate-180' : ''}`}>&#9660;</span>
  );
}

export function SearchBox({ value, onChange, label = 'Search' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="relative w-full sm:w-auto">
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--ds-ink)]" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        aria-label={label}
        className="w-full sm:w-60 rounded-[10px] border border-[color:var(--ds-line)] bg-white py-2 pl-9 pr-4 text-sm text-[color:var(--ds-ink)] placeholder:text-[color:var(--ds-placeholder)] focus:border-[color:var(--ds-primary)] focus:outline-none"
      />
    </div>
  );
}

/** Outlined pill with a checkbox popover and Apply, like Anchor's "Client status" filter. */
export function FilterChip<T extends string>({
  title, options, value, onApply, summary,
}: {
  title: string;
  options: Array<{ value: T; label: string }>;
  value: T[];
  onApply: (v: T[]) => void;
  summary?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<T[]>(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const all = draft.length === options.length;
  const label = summary ?? (value.length === options.length ? title : `${title} (${options.filter((o) => value.includes(o.value)).map((o) => o.label).join(', ') || 'None'})`);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => { setDraft(value); setOpen((o) => !o); }}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="anchor-chip inline-flex items-center gap-2 rounded-[10px] border border-[color:var(--ds-ink)] bg-white px-4 py-2 text-sm text-[color:var(--ds-ink)]"
      >
        {label}<Chevron up={open} />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-2 w-64 rounded-[10px] border border-[color:var(--ds-line)] bg-white p-4 shadow-lg" role="dialog" aria-label={title}>
          <div className="mb-3 flex items-center justify-between text-sm text-[color:var(--ds-body)]">
            {title}
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-lg leading-none text-[color:var(--ds-ink)]">×</button>
          </div>
          <label className="flex items-center gap-3 py-2 text-sm text-[color:var(--ds-ink)]">
            <input type="checkbox" checked={all} onChange={() => setDraft(all ? [] : options.map((o) => o.value))} className="h-4 w-4 accent-[color:var(--ds-primary)]" />
            Select all
          </label>
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-3 py-2 text-sm text-[color:var(--ds-ink)]">
              <input
                type="checkbox"
                checked={draft.includes(o.value)}
                onChange={() => setDraft((d) => (d.includes(o.value) ? d.filter((x) => x !== o.value) : [...d, o.value]))}
                className="h-4 w-4 accent-[color:var(--ds-primary)]"
              />
              {o.label}
            </label>
          ))}
          <button type="button" className={`${A.primary} mt-3 w-full`} onClick={() => { onApply(draft.length ? draft : options.map((o) => o.value)); setOpen(false); }}>Apply</button>
        </div>
      )}
    </div>
  );
}

/** Anchor's empty state: bold title, muted line, Clear filters button. */
export function EmptyState({ title, body, action }: { title: string; body: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="py-14 text-center">
      <div className="font-semibold text-[color:var(--ds-ink)]">{title}</div>
      <div className="mt-1 text-sm text-[color:var(--ds-body)]">{body}</div>
      {action && <button type="button" onClick={action.onClick} className={`${A.primary} mt-4`}>{action.label}</button>}
    </div>
  );
}

/** Anchor's settings row: label left, control right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[1fr_1fr] sm:items-center">
      <div>
        <div className="text-sm text-[color:var(--ds-ink)]">{label}</div>
        {hint && <div className="text-xs text-[color:var(--ds-body)]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/* ---------- Edit columns (Anchor "Edit columns" popover) ---------- */

export type ColumnDef = { key: string; label: string; /** 1-based position of the column in the table */ index: number };

/** Remembers which optional columns are shown, per table, in this browser. */
export function useColumns(storageKey: string, cols: ColumnDef[]) {
  const all = cols.map((c) => c.key);
  const [visible, setVisible] = useState<string[]>(all);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(`anchor-cols:${storageKey}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(parsed)) setVisible(all.filter((k) => parsed.includes(k)));
      }
    } catch { /* keep defaults */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);
  const apply = (v: string[]) => {
    setVisible(v);
    try { window.localStorage.setItem(`anchor-cols:${storageKey}`, JSON.stringify(v)); } catch { /* noop */ }
  };
  return { visible, apply };
}

/** Hides unchecked columns. Rows with a colspan (loading, empty) are left alone. */
export function ColumnStyle({ tableClass, cols, visible }: { tableClass: string; cols: ColumnDef[]; visible: string[] }) {
  const css = cols
    .filter((c) => !visible.includes(c.key))
    .map((c) => `.${tableClass} :is(th,td):nth-child(${c.index}):not([colspan]){display:none}`)
    .join('\n');
  return css ? <style>{css}</style> : null;
}

export function EditColumns({ cols, visible, onApply }: { cols: ColumnDef[]; visible: string[]; onApply: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(visible);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <button type="button" className={`${A.outline} inline-flex items-center gap-2`} aria-expanded={open} aria-haspopup="dialog" onClick={() => { setDraft(visible); setOpen((o) => !o); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        Edit columns
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-[10px] border border-[color:var(--ds-line)] bg-white p-4 shadow-lg" role="dialog" aria-label="Edit columns">
          <div className="mb-3 flex items-center justify-between text-sm text-[color:var(--ds-body)]">
            Edit columns
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-lg leading-none text-[color:var(--ds-ink)]">×</button>
          </div>
          {cols.map((c) => (
            <label key={c.key} className="flex items-center gap-3 py-2 text-sm text-[color:var(--ds-ink)]">
              <input type="checkbox" className="h-4 w-4 accent-[color:var(--ds-primary)]" checked={draft.includes(c.key)} onChange={() => setDraft((d) => (d.includes(c.key) ? d.filter((x) => x !== c.key) : [...d, c.key]))} />
              {c.label}
            </label>
          ))}
          <button type="button" className={`${A.primary} mt-3 w-full`} onClick={() => { onApply(draft); setOpen(false); }}>Apply</button>
        </div>
      )}
    </div>
  );
}

/** Anchor-style on/off switch. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`anchor-toggle relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-[color:var(--ds-primary)]' : 'bg-[color:var(--ds-line)]'} ${disabled ? 'opacity-60' : ''}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}

export type MenuItem = { label: string; onClick?: () => void; href?: string; disabled?: boolean; danger?: boolean };

/** One "more" button per row or card. Keeps a single main action visible and tucks the rest into a menu. */
export function RowMenu({ items, label = 'More actions', plain = false }: { items: MenuItem[]; label?: string; plain?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', onDoc); window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  const shown = items.filter((i) => i.label);
  if (shown.length === 0) return null;
  return (
    <div ref={ref} className="inline-block">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={plain ? 'inline-flex h-9 w-9 items-center justify-center text-lg leading-none text-[color:var(--ds-ink)]' : 'anchor-outline inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[color:var(--ds-line)] bg-white text-lg leading-none text-[color:var(--ds-ink)] hover:bg-[color:var(--ds-hover)]'}
        style={plain ? { border: 0, background: 'transparent' } : undefined}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
          setOpen((o) => !o);
        }}
      >
        <span aria-hidden="true" className={plain ? 'inline-block rotate-90' : undefined}>⋯</span>
      </button>
      {open && pos && (
        <div role="menu" style={{ position: 'fixed', top: pos.top, right: pos.right }} className="z-[70] w-56 rounded-[10px] border border-[color:var(--ds-line)] bg-white p-1 shadow-lg">
          {shown.map((i) => {
            const cls = `block w-full rounded-[10px] px-3 py-2 text-left text-sm ${i.danger ? 'text-red-700' : 'text-[color:var(--ds-ink)]'} hover:bg-[color:var(--ds-hover)] disabled:opacity-50`;
            return i.href ? (
              <a key={i.label} role="menuitem" href={i.href} className={cls} onClick={() => setOpen(false)}>{i.label}</a>
            ) : (
              <button key={i.label} type="button" role="menuitem" disabled={i.disabled} className={cls} style={{ border: 0, background: 'transparent' }} onClick={() => { setOpen(false); i.onClick?.(); }}>{i.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );
}
