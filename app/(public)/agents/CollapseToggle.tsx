'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

type CollapseState = 'open' | 'closed';

/**
 * Collapsible cards. Put `{...section(id)}` on the card; its first child is the
 * header and stays visible, every later child hides while collapsed.
 * Unset cards default to closed on every screen size (handled in CSS, so there
 * is no flash on load). Pass `{ mobileOpen: true }` to start a card open.
 */
export function useCollapsibles() {
  const [states, setStates] = useState<Record<string, CollapseState>>({});

  const isOpen = useCallback(
    (id: string, mobileOpen = false) => {
      const state = states[id];
      if (state) return state === 'open';
      return mobileOpen;
    },
    [states],
  );

  const toggle = useCallback(
    (id: string, mobileOpen = false) => {
      setStates((current) => {
        const openNow = current[id] ? current[id] === 'open' : mobileOpen;
        return { ...current, [id]: openNow ? 'closed' : 'open' };
      });
    },
    [],
  );

  const section = useCallback(
    (id: string, options: { mobileOpen?: boolean } = {}) => ({
      'data-collapsible': '',
      'data-section-key': id,
      'data-collapsed': states[id] ?? (options.mobileOpen ? 'open' : 'auto'),
    }),
    [states],
  );

  const toggleProps = useCallback(
    (id: string, label: string, options: { mobileOpen?: boolean } = {}) => ({
      open: isOpen(id, options.mobileOpen),
      onToggle: () => toggle(id, options.mobileOpen),
      label,
    }),
    [isOpen, toggle],
  );

  const reveal = useCallback((id: string) => setStates((current) => ({ ...current, [id]: 'open' })), []);

  return { section, toggleProps, reveal };
}

export default function CollapseToggle({
  open,
  onToggle,
  label,
  tone = 'dark',
  className = '',
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  tone?: 'dark' | 'light';
  className?: string;
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
      aria-label={`${open ? 'Collapse' : 'Expand'} ${label}`}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border transition ${styles} ${className}`}
    >
      <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  );
}


/**
 * Sticky pill bar listing every card on the page that carries a
 * data-section-key. Tapping a pill opens that card and scrolls to it.
 */
export function SectionPills({ labels, reveal }: { labels: Record<string, string>; reveal: (id: string) => void }) {
  const [keys, setKeys] = useState<string[]>([]);

  useEffect(() => {
    const scan = () => {
      const found = Array.from(document.querySelectorAll<HTMLElement>('[data-section-key]'))
        .map((el) => el.dataset.sectionKey ?? '')
        .filter((key, index, all) => key && labels[key] && all.indexOf(key) === index);
      setKeys((current) => (current.join('|') === found.join('|') ? current : found));
    };
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [labels]);

  if (keys.length < 2) return null;
  const go = (key: string) => {
    reveal(key);
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-section-key="${key}"]`);
      if (!el) return;
      el.style.scrollMarginTop = '64px';
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  };
  return (
    <nav aria-label="Jump to section" className="sticky top-0 z-30 -mx-5 mt-5 border-y border-slate-200 bg-[#F7F5F1]/95 px-5 py-2 backdrop-blur sm:-mx-8 sm:px-8">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {keys.map((key) => (
          <button key={key} type="button" onClick={() => go(key)} className="min-h-[36px] shrink-0 rounded-full border border-[#7059A8]/40 bg-white px-3 text-xs font-bold text-[#301D5D] hover:border-[#301D5D] hover:bg-[#F8F5FF]">
            {labels[key]}
          </button>
        ))}
      </div>
    </nav>
  );
}
