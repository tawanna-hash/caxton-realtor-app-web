'use client';

import { useState, type ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

export type NavSection = {
  id: string;
  title: ReactNode;
  sub?: ReactNode;
  trailing?: ReactNode;
  /** Sections with the same group are listed under one small heading. */
  group?: string;
  content: ReactNode;
};

/**
 * Master-detail for pages made of several sections: the sections are listed on
 * the left and the selected one fills the right. On phones it is two screens:
 * the list, then the section with a Back button. Every section stays mounted
 * (hidden when not selected) so typed values and loaded data are kept.
 */
export default function SectionNav({ sections, backLabel, testId, initial }: {
  sections: NavSection[];
  backLabel: string;
  testId?: string;
  initial?: string;
}) {
  const [selected, setSelected] = useState(initial ?? '');
  const [mobileOpen, setMobileOpen] = useState(false);
  if (sections.length === 0) return null;
  const currentId = sections.some((s) => s.id === selected) ? selected : sections[0].id;
  let lastGroup: string | undefined;
  return (
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]" data-testid={testId}>
      <nav aria-label={backLabel} className={`min-w-0 overflow-hidden rounded-[4px] border border-[#E6E5EC] bg-white ${mobileOpen ? 'max-lg:hidden' : ''}`}>
        {sections.map((s) => {
          const head = s.group && s.group !== lastGroup ? s.group : null;
          lastGroup = s.group;
          return (
          <div key={s.id}>
          {head && <p className="border-b border-[#E6E5EC] bg-[#F6F3FB] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[#6B6878]">{head}</p>}
          <button
            type="button"
            onClick={() => { setSelected(s.id); setMobileOpen(true); window.requestAnimationFrame(() => window.document.getElementById(`sn-${testId ?? 'detail'}`)?.scrollIntoView({ block: 'start' })); }}
            aria-current={currentId === s.id ? 'true' : undefined}
            className={`!flex !h-auto w-full !items-center !justify-start !gap-3 !rounded-none !border-0 !border-b !border-[#E6E5EC] !px-4 !py-3 text-left ${currentId === s.id ? '!bg-[#EFEAF8] shadow-[inset_2px_0_0_#301D5D]' : '!bg-white hover:!bg-[#F6F3FB]'}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-5 text-[#1B1726]">{s.title}</span>
              {s.sub && <span className="block text-xs font-normal text-[#6B6878]">{s.sub}</span>}
            </span>
            {s.trailing && <span className="shrink-0 text-xs font-medium text-[#4A4757]">{s.trailing}</span>}
          </button>
          </div>
          );
        })}
      </nav>
      <div id={`sn-${testId ?? 'detail'}`} className={`min-w-0 scroll-mt-4 space-y-4 ${mobileOpen ? '' : 'max-lg:hidden'}`}>
        <button type="button" onClick={() => setMobileOpen(false)} className="!inline-flex !h-9 !flex-row !items-center !gap-1 !px-2 lg:!hidden"><ChevronLeft className="h-4 w-4" aria-hidden="true" />Back To {backLabel}</button>
        {sections.map((s) => (
          <div key={s.id} hidden={s.id !== currentId} className="min-w-0 space-y-4">{s.content}</div>
        ))}
      </div>
    </div>
  );
}
