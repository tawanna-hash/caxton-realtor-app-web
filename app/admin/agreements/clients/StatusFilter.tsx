'use client';

import { FilterChip } from '@/components/anchor/ui';
import { GROUP_OPTIONS, type Group } from './data';

// Anchor-style status chip. Active is selected by default and is always the
// starting view; Prospect and Archived are one click away.
export default function StatusSelect({ title, value, onChange }: { title: string; value: Group[]; onChange: (v: Group[]) => void }) {
  const names = GROUP_OPTIONS.filter((o) => value.includes(o.value)).map((o) => o.label).join(', ');
  return <FilterChip<Group> title={title} options={GROUP_OPTIONS} value={value} onApply={onChange} summary={`${title} (${names})`} />;
}

export function SortTh({ label, dir, onClick }: { label: string; dir?: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th>
      <button type="button" onClick={onClick} style={{ border: 0, background: 'transparent', padding: 0 }} className="inline-flex items-center gap-1 text-xs font-medium text-[color:var(--ds-body)]">
        {label}<span aria-hidden="true" className={dir ? 'text-[color:var(--ds-ink)]' : 'opacity-40'}>{dir === 'desc' ? '▾' : '▴'}</span>
      </button>
    </th>
  );
}
