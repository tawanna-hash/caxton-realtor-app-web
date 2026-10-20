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
