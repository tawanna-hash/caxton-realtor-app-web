'use client';

import { FILTER_LABEL, type StatusFilter } from './data';

export default function StatusSelect({ label, value, onChange }: { label: string; value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  return (
    <label className="relative inline-flex items-center">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as StatusFilter)} aria-label={label}
        className="anchor-input rounded-full border border-[color:var(--ds-primary)] bg-white py-2 pl-4 pr-9 text-sm text-[color:var(--ds-ink)]">
        {(Object.keys(FILTER_LABEL) as StatusFilter[]).map((k) => <option key={k} value={k}>{label} ({FILTER_LABEL[k]})</option>)}
      </select>
    </label>
  );
}
