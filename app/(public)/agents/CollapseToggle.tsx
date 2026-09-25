'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const MOBILE_QUERY = '(max-width: 767px)';

type CollapseState = 'open' | 'closed';

/**
 * Collapsible cards. Put `{...section(id)}` on the card; its first child is the
 * header and stays visible, every later child hides while collapsed.
 * Unset cards default to closed on every screen size (handled in CSS, so there
 * is no flash on load). Pass `{ mobileOpen: true }` to start a card open.
 */
export function useCollapsibles() {
  const [states, setStates] = useState<Record<string, CollapseState>>({});
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const isOpen = useCallback(
    (id: string, mobileOpen = false) => {
      const state = states[id];
      if (state) return state === 'open';
      return mobileOpen;
    },
    [states, isMobile],
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

  return { section, toggleProps };
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
