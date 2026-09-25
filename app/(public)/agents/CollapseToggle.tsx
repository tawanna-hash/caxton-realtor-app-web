'use client';

import { ChevronDown } from 'lucide-react';

export default function CollapseToggle({
  open,
  onToggle,
  label,
  tone = 'dark',
  controls,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  tone?: 'dark' | 'light';
  controls?: string;
}) {
  const styles =
    tone === 'light'
      ? 'border-white/25 text-white hover:bg-white/10'
      : 'border-slate-300 text-[#301D5D] hover:border-[#301D5D]';
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition ${styles}`}
    >
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  );
}
