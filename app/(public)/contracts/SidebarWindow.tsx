import type { ReactNode } from 'react';
import { BTN_PRIMARY, BTN_SECONDARY } from './ui';

export type SidebarItem = { id: string; label: string; heading?: string };

/** Left sidebar of choices and a right window, the layout every Closing Time (limited edition) page shares. */
export default function SidebarWindow({
  label, items, selected, onSelect, children,
}: {
  label: string;
  items: SidebarItem[];
  selected: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <nav aria-label={label}>
        {/* Phones and tablets: one dropdown instead of a long stack of buttons. */}
        <select
          aria-label={label}
          value={selected}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full rounded-lg border border-[#D9D2E9] bg-white px-4 py-3 text-base font-semibold text-[#301D5D] lg:hidden"
        >
          {items.map((item) => (
            <option key={item.id} value={item.id}>{item.heading ? `${item.heading}: ${item.label}` : item.label}</option>
          ))}
        </select>
        <ul className="hidden gap-2 lg:flex lg:flex-col">
          {items.map((item, i) => (
            <li key={item.id} className="shrink">
              {item.heading && (i === 0 || items[i - 1]?.heading !== item.heading) && (
                <p className="mb-2 mt-3 hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5B5470] lg:block">{item.heading}</p>
              )}
              <button
                type="button"
                aria-current={item.id === selected ? 'true' : undefined}
                onClick={() => onSelect(item.id)}
                className={`${item.id === selected ? BTN_PRIMARY : BTN_SECONDARY} !w-full !justify-start !text-left`}
              >
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
