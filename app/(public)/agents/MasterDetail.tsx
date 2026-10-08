'use client';

import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export type MDItem = {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  /** Tailwind background class for the status dot. */
  dot?: string;
  /** Rows with the same group are listed under one small heading. */
  group?: string;
};

/**
 * Master-detail: a list on the left and the selected item on the right.
 * On phones it is two screens: the list, then the detail with a Back button.
 */
export default function MasterDetail({ items, empty, renderDetail, backLabel, testId }: {
  items: MDItem[];
  empty: ReactNode;
  renderDetail: (id: string) => ReactNode;
  backLabel: string;
  testId?: string;
}) {
  const [selected, setSelected] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  if (items.length === 0) {
    if (empty === null) return null;
    return <div className="rounded-[4px] border border-[#E6E5EC] bg-white px-4 py-6 text-sm text-[#6B6878]" data-testid={testId}>{empty}</div>;
  }
  const currentId = items.some((i) => i.id === selected) ? selected : items[0].id;
  let lastGroup: string | undefined;
  return (
    <div className="grid min-w-0 overflow-hidden rounded-[4px] border border-[#E6E5EC] bg-white lg:grid-cols-[minmax(0,1fr)_340px]" data-testid={testId}>
      <div className={`min-w-0 border-b border-[#E6E5EC] lg:border-b-0 ${mobileOpen ? 'max-lg:hidden' : ''}`}>
        {items.map((item) => {
          const head = item.group && item.group !== lastGroup ? item.group : null;
          lastGroup = item.group;
          return (
            <div key={item.id}>
              {head && <p className="border-b border-[#E6E5EC] bg-[#F6F3FB] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]">{head}</p>}
              <button
                type="button"
                onClick={() => { setSelected(item.id); setMobileOpen(true); window.requestAnimationFrame(() => window.document.getElementById('md-detail')?.scrollIntoView({ block: 'start' })); }}
                aria-current={currentId === item.id ? 'true' : undefined}
                className={`!flex !h-auto w-full !items-center !justify-start !gap-3 !rounded-none !border-0 !border-b !border-[#E6E5EC] !px-4 !py-3 text-left ${currentId === item.id ? '!bg-[#EFEAF8] shadow-[inset_2px_0_0_#301D5D]' : '!bg-white hover:!bg-[#F6F3FB]'}`}
              >
                {item.dot && <span className={`h-2 w-2 shrink-0 rounded-full ${item.dot}`} aria-hidden="true" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold leading-5 text-[#1B1726] lg:break-words">{item.title}</span>
                  {item.sub && <span className="block text-xs font-normal text-[#6B6878] lg:break-words">{item.sub}</span>}
                </span>
                {item.trailing && <span className="shrink-0 text-xs font-medium text-[#4A4757]">{item.trailing}</span>}
              </button>
            </div>
          );
        })}
      </div>
      <div id="md-detail" className={`min-w-0 scroll-mt-4 space-y-4 border-[#E6E5EC] p-4 lg:border-l ${mobileOpen ? '' : 'max-lg:hidden'}`}>
        <button type="button" onClick={() => setMobileOpen(false)} className="mb-1 !inline-flex !h-9 !flex-row !items-center !gap-1 !px-2 lg:!hidden"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Back To {backLabel}</button>
        {renderDetail(currentId)}
      </div>
    </div>
  );
}

/** Label and value pairs for the detail side. */
export function DetailFields({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="space-y-3">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]">{label}</dt>
          <dd className="mt-0.5 break-words text-sm text-[#1B1726]">{value || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
