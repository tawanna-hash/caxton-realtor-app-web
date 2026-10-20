'use client';

// components/anchor/ui.tsx
//
// Shared building blocks for the Agreements (Beta) workspace, matched to the
// Anchor app's layout: plain page title, outlined pill filters with checkbox
// popovers and Apply, rounded-rectangle buttons, gray table header with white
// row cards, label-left settings rows. Realty News Now logo and navigation stay.

import { useEffect, useRef, useState } from 'react';

export const ANCHOR = {
  primary: '#5B3FE3',
  primaryHover: '#4B30CC',
  navy: '#261E5A',
  muted: '#6E6A8A',
  line: '#D8D5E6',
  tint: '#F3F0FF',
  headBg: '#EEEDF3',
} as const;

export const A = {
  title: 'text-2xl font-semibold text-[#261E5A]',
  subtitle: 'text-sm text-[#6E6A8A]',
  primary: 'anchor-primary inline-flex items-center justify-center rounded-md bg-[#5B3FE3] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#4B30CC] disabled:cursor-not-allowed disabled:opacity-50',
  outline: 'anchor-outline inline-flex items-center justify-center rounded-md border border-[#5B3FE3] bg-white px-4 py-2 text-sm font-medium text-[#5B3FE3] hover:bg-[#F3F0FF] disabled:cursor-not-allowed disabled:opacity-50',
  small: 'anchor-outline inline-flex items-center justify-center rounded-md border border-[#5B3FE3] bg-white px-3 py-1.5 text-xs font-medium text-[#5B3FE3] hover:bg-[#F3F0FF] disabled:cursor-not-allowed disabled:opacity-50',
  input: 'w-full rounded-md border border-[#D8D5E6] bg-white px-3 py-2.5 text-sm text-[#261E5A] placeholder:text-[#9A97B3] focus:border-[#5B3FE3] focus:outline-none',
  card: 'rounded-lg border border-[#ECEAF4] bg-white',
  // White row cards on a tinted page, gray header row.
  table: 'w-full border-separate text-left text-sm [border-spacing:0_6px] [&_thead_th]:bg-[#EEEDF3] [&_thead_th]:px-3 [&_thead_th]:py-2.5 [&_thead_th]:text-xs [&_thead_th]:font-medium [&_thead_th]:text-[#6E6A8A] [&_thead_th:first-child]:rounded-l-md [&_thead_th:last-child]:rounded-r-md [&_tbody_td]:bg-white [&_tbody_td]:px-3 [&_tbody_td]:py-3.5 [&_tbody_td:first-child]:rounded-l-md [&_tbody_td:last-child]:rounded-r-md',
  notice: 'rounded-md border border-[#D8D5E6] bg-[#F3F0FF] px-4 py-2 text-sm text-[#261E5A]',
  error: 'rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700',
} as const;

function Chevron({ up }: { up?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" aria-hidden="true" className={up ? 'rotate-180' : ''}>
      <path d="M5 8l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SearchBox({ value, onChange, label = 'Search' }: { value: string; onChange: (v: string) => void; label?: string }) {
  return (
    <div className="relative">
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#261E5A]" width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
        <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search..."
        aria-label={label}
        className="w-60 rounded-full border border-[#D8D5E6] bg-white py-2 pl-9 pr-4 text-sm text-[#261E5A] placeholder:text-[#9A97B3] focus:border-[#5B3FE3] focus:outline-none"
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
        className="anchor-chip inline-flex items-center gap-2 rounded-full border border-[#261E5A] bg-white px-4 py-2 text-sm text-[#261E5A]"
      >
        {label}<Chevron up={open} />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-2 w-64 rounded-lg border border-[#ECEAF4] bg-white p-4 shadow-lg" role="dialog" aria-label={title}>
          <div className="mb-3 flex items-center justify-between text-sm text-[#6E6A8A]">
            {title}
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-lg leading-none text-[#261E5A]">×</button>
          </div>
          <label className="flex items-center gap-3 py-2 text-sm text-[#261E5A]">
            <input type="checkbox" checked={all} onChange={() => setDraft(all ? [] : options.map((o) => o.value))} className="h-4 w-4 accent-[#5B3FE3]" />
            Select all
          </label>
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-3 py-2 text-sm text-[#261E5A]">
              <input
                type="checkbox"
                checked={draft.includes(o.value)}
                onChange={() => setDraft((d) => (d.includes(o.value) ? d.filter((x) => x !== o.value) : [...d, o.value]))}
                className="h-4 w-4 accent-[#5B3FE3]"
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
      <div className="font-semibold text-[#261E5A]">{title}</div>
      <div className="mt-1 text-sm text-[#6E6A8A]">{body}</div>
      {action && <button type="button" onClick={action.onClick} className={`${A.primary} mt-4`}>{action.label}</button>}
    </div>
  );
}

/** Anchor's settings row: label left, control right. */
export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 py-4 sm:grid-cols-[1fr_1fr] sm:items-center">
      <div>
        <div className="text-sm text-[#261E5A]">{label}</div>
        {hint && <div className="text-xs text-[#6E6A8A]">{hint}</div>}
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
      <button type="button" className={`${A.outline} inline-flex items-center gap-2`} aria-expanded={open} onClick={() => { setDraft(visible); setOpen((o) => !o); }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
        Edit columns
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-[#ECEAF4] bg-white p-4 shadow-lg" role="dialog" aria-label="Edit columns">
          <div className="mb-3 flex items-center justify-between text-sm text-[#6E6A8A]">
            Edit columns
            <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="text-lg leading-none text-[#261E5A]">×</button>
          </div>
          {cols.map((c) => (
            <label key={c.key} className="flex items-center gap-3 py-2 text-sm text-[#261E5A]">
              <input type="checkbox" className="h-4 w-4 accent-[#5B3FE3]" checked={draft.includes(c.key)} onChange={() => setDraft((d) => (d.includes(c.key) ? d.filter((x) => x !== c.key) : [...d, c.key]))} />
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
      className={`anchor-toggle relative h-7 w-12 shrink-0 rounded-full transition ${on ? 'bg-[#5B3FE3]' : 'bg-[#C9C6D8]'} ${disabled ? 'opacity-60' : ''}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
