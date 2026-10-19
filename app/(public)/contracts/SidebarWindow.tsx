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
        <ul className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:overflow-visible">
          {items.map((item, i) => (
            <li key={item.id} className="shrink-0 snap-start lg:shrink">
              {item.heading && (i === 0 || items[i - 1]?.heading !== item.heading) && (
                <p className="mb-2 mt-3 hidden text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5B5470] lg:block">{item.heading}</p>
              )}
              <button
                type="button"
                aria-current={item.id === selected ? 'true' : undefined}
                onClick={() => onSelect(item.id)}
                className={`${item.id === selected ? BTN_PRIMARY : BTN_SECONDARY} lg:!w-full !justify-start !text-left max-w-[16rem] lg:max-w-none`}
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
