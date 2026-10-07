'use client';

import { useEffect } from 'react';

const SKIP = 'header, nav, aside, footer, [role="menu"], [role="listbox"], [role="dialog"], [role="tablist"], .ds-rail';

/**
 * Opens collapsed sections (details blocks and accordion toggles) the first time they scroll into view,
 * on every page. Each section is opened once; if you close it again afterwards it stays closed.
 * Menus, dropdowns, dialogs and navigation toggles are left alone.
 */
export default function AutoOpenSections() {
  useEffect(() => {
    const seen = new WeakSet<Element>();
    const isToggle = (el: Element) =>
      el instanceof HTMLButtonElement &&
      el.getAttribute('aria-expanded') === 'false' &&
      !el.hasAttribute('aria-haspopup') &&
      el.getAttribute('role') !== 'combobox' &&
      !el.disabled &&
      !el.closest(SKIP);
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        io.unobserve(el);
        if (seen.has(el)) continue;
        seen.add(el);
        if (el instanceof HTMLDetailsElement) {
          if (!el.open && !el.closest(SKIP)) el.open = true;
        } else if (isToggle(el)) {
          (el as HTMLButtonElement).click();
        }
      }
    }, { threshold: 0.6 });
    const watch = (root: ParentNode) => {
      root.querySelectorAll('details:not([open]), button[aria-expanded="false"]').forEach((el) => {
        if (!seen.has(el)) io.observe(el);
      });
    };
    watch(document);
    let pending = 0;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = window.setTimeout(() => { pending = 0; watch(document); }, 200);
    });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'open'] });
    return () => { io.disconnect(); mo.disconnect(); if (pending) window.clearTimeout(pending); };
  }, []);
  return null;
}
